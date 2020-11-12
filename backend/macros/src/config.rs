//! A proc macro to easily and concisely define the configuration for Tobira.
//!
//! I thought a lot about configuration and as far as I see it, a proc macro is
//! basically required to avoid duplicate code, docs or values.

// TODO:
// - Make visibility configurable
// - Configure what other traits to derive (e.g. `Clone`)

use proc_macro2::{Span, TokenStream};
use quote::quote;
use syn::{
    Error, Ident,
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    spanned::Spanned,
};
use std::fmt::{self, Write};


/// Entry point: parses the input and generates output.
pub(crate) fn run(input: TokenStream) -> Result<TokenStream, Error> {
    let input = syn::parse2::<Input>(input)?;

    let toml = gen_toml(&input);
    let types = gen_types(&input);
    let util_code = util_code();

    Ok(quote! {
        const TOML_TEMPLATE: &str = #toml;

        #types

        mod util {
            #util_code
        }
    })
}


// ==============================================================================================
// ===== Generating the output
// ==============================================================================================

fn util_code() -> TokenStream {
    quote! {
        use std::fmt::{self, Write};

        #[derive(Debug)]
        pub(crate) struct TryFromError {
            pub(crate) path: &'static str,
        }

        impl fmt::Display for TryFromError {
            fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
                std::write!(f, "required configuration value is missing: '{}'", self.path)
            }
        }

        impl std::error::Error for TryFromError {}
    }
}

fn gen_types(input: &Input) -> TokenStream {
    fn gen_recursive(
        raw_types: &mut TokenStream,
        user_types: &mut TokenStream,
        name: &Ident,
        doc: &[String],
        fields: &[Node],
    ) {
        let type_name = to_camel_case(name);

        let mut raw_field_tokens = TokenStream::new();
        let mut overwrite_with_fields = TokenStream::new();
        let mut user_field_tokens = TokenStream::new();
        let mut try_from_fields = TokenStream::new();

        let visibility = quote! { pub(crate) };
        for node in fields {
            match node {
                Node::Leaf { doc, name, ty, .. } => {
                    let inner = as_option(&ty).unwrap_or(&ty);

                    raw_field_tokens.extend(quote! {
                        #visibility #name: Option<#inner>,
                    });
                    overwrite_with_fields.extend(quote! {
                        #name: self.#name.or(other.#name),
                    });
                    user_field_tokens.extend(quote! {
                        #( #[doc = #doc] )*
                        #visibility #name: #ty,
                    });
                    try_from_fields.extend(quote! {
                        #name: src.#name.ok_or(util::TryFromError { path: "TODO" })?,
                    });
                }
                Node::Object { name, .. } => {
                    let type_name = to_camel_case(name);

                    raw_field_tokens.extend(quote! {
                        #[serde(default)]
                        #visibility #name: #type_name,
                    });
                    overwrite_with_fields.extend(quote! {
                        #name: self.#name.overwrite_with(other.#name),
                    });
                    user_field_tokens.extend(quote! {
                        #visibility #name: #type_name,
                    });
                    try_from_fields.extend(quote! {
                        #name: std::convert::TryFrom::try_from(src.#name)?,
                    })
                }
            }
        }

        raw_types.extend(quote! {
            #[derive(Debug, Default, serde::Deserialize)]
            #[serde(deny_unknown_fields)]
            #visibility struct #type_name {
                #raw_field_tokens
            }

            impl #type_name {
                #visibility fn overwrite_with(self, other: Self) -> Self {
                    Self { #overwrite_with_fields }
                }
            }
        });
        user_types.extend(quote! {
            #( #[doc = #doc] )*
            #[derive(Debug)]
            #visibility struct #type_name {
                #user_field_tokens
            }

            impl std::convert::TryFrom<raw::#type_name> for #type_name {
                type Error = util::TryFromError;
                fn try_from(src: raw::#type_name) -> Result<Self, Self::Error> {
                    Ok(Self {
                        #try_from_fields
                    })
                }
            }
        });

        // Recurse on all children.
        for node in fields {
            if let Node::Object { doc, name, children } = node {
                gen_recursive(raw_types, user_types, name, doc, children);
            }
        }
    }

    let mut raw_types = TokenStream::new();
    let mut user_types = TokenStream::new();
    let root_name = Ident::new("config", Span::call_site());
    gen_recursive(&mut raw_types, &mut user_types, &root_name, &input.doc, &input.fields);


    quote! {
        /// Types where all configuration values are optional.
        ///
        /// The types in this module also represent the full configuration tree,
        /// but all values are optional. That's useful for intermediate steps or
        /// "layers" of configuration sources. Imagine that the three layers:
        /// environment variables, a TOML file and the fixed default values. The
        /// only thing that matters is that required values are present after
        /// merging all sources, but each individual source can be missing
        /// required values.
        ///
        /// These types implement `serde::Deserialize`.
        mod raw {
            use super::*;

            #raw_types
        }

        #user_types
    }
}

/// Generates the TOML template file.
fn gen_toml(input: &Input) -> String {
    let mut out = String::new();

    /// Writes all doc comments to the file.
    fn write_doc(out: &mut String, doc: &[String]) {
        for line in doc {
            writeln!(out, "#{}", line).unwrap();
        }
    }

    /// Adds zero, one or two line breaks to make sure that there are at least
    /// two line breaks at the end of the string.
    fn add_empty_line(out: &mut String) {
        match () {
            () if out.ends_with("\n\n") => {},
            () if out.ends_with('\n') => out.push('\n'),
            _ => out.push_str("\n\n"),
        }
    }

    fn gen_recursive(out: &mut String, path: Vec<&syn::Ident>, fields: &[Node]) {
        // If a new subsection starts, we always print the header, even if not
        // strictly necessary.
        if !path.is_empty() {
            let joined_path = path.iter()
                .map(|ident| ident.to_string())
                .collect::<Vec<_>>()
                .join(".");
            writeln!(out, "[{}]", joined_path).unwrap();
        }

        // First just emit all leaf nodes/direct fields.
        for node in fields {
            if let Node::Leaf { doc, name, ty, default, example } = node {
                write_doc(out, doc);

                // Add note about default value or the value being required.
                match default {
                    Some(default) => {
                        if !doc.is_empty() {
                            writeln!(out, "#").unwrap();
                        }
                        writeln!(out, "# Default: {}", default).unwrap();
                    }
                    None if as_option(ty).is_some() => {}
                    None => {
                        if !doc.is_empty() {
                            writeln!(out, "#").unwrap();
                        }
                        writeln!(out, "# Required! This value must be specified.").unwrap();
                    }
                }

                // We check that already when parsing.
                let example = example.as_ref()
                    .or(default.as_ref())
                    .expect("neither example nor default");

                // Commented out example.
                writeln!(out, "#{} = {}", name, example).unwrap();
                add_empty_line(out);
            }
        }
        add_empty_line(out);

        // Recurse on all children.
        for node in fields {
            if let Node::Object { doc, name, children } = node {
                write_doc(out, doc);
                let mut child_path = path.clone();
                child_path.push(name);
                gen_recursive(out, child_path, children);
            }
        }
    };

    write_doc(&mut out, &input.doc);
    add_empty_line(&mut out);
    gen_recursive(&mut out, vec![], &input.fields);

    while out.ends_with("\n\n") {
        out.pop();
    }

    out
}


fn to_camel_case(ident: &Ident) -> Ident {
    let s = ident.to_string();
    let first = s.chars().next().unwrap();
    let out = format!("{}{}", first.to_uppercase(), &s[first.len_utf8()..]);
    Ident::new(&out, ident.span())
}

// ==============================================================================================
// ===== Parsing the input
// ==============================================================================================

/// The parsed input to the `gen_config` macro.
#[derive(Debug)]
struct Input {
    doc: Vec<String>,
    fields: Vec<Node>,
}

/// One node in the tree of the configuration format. Can either be a leaf node
/// (a string, int, float or bool value) or an internal node that contains
/// children.
#[derive(Debug)]
enum Node {
    Object {
        doc: Vec<String>,
        name: syn::Ident,
        children: Vec<Node>,
    },
    Leaf {
        doc: Vec<String>,
        name: syn::Ident,
        ty: syn::Type,
        default: Option<Expr>,
        example: Option<Expr>,
    },
}

impl Parse for Input {
    fn parse(input: ParseStream) -> Result<Self, syn::Error> {
        let mut outer_attrs = input.call(syn::Attribute::parse_inner)?;
        let doc = extract_doc(&mut outer_attrs)?;
        let fields = input.call(<Punctuated<_, syn::Token![,]>>::parse_terminated)?;
        assert_no_extra_attrs(&outer_attrs)?;

        Ok(Self {
            doc,
            fields: fields.into_iter().collect(),
        })
    }
}

impl Parse for Node {
    fn parse(input: ParseStream) -> Result<Self, syn::Error> {
        let mut attrs = input.call(syn::Attribute::parse_outer)?;
        let doc = extract_doc(&mut attrs)?;

        // All nodes start with an identifier and a colon.
        let name = input.parse()?;
        let _: syn::Token![:] = input.parse()?;

        let out = if input.lookahead1().peek(syn::token::Brace) {
            // --- A nested object ---

            let inner;
            syn::braced!(inner in input);
            let fields = inner.call(<Punctuated<_, syn::Token![,]>>::parse_terminated)?;

            Self::Object {
                doc,
                name,
                children: fields.into_iter().collect(),
            }
        } else {
            // --- A single value ---

            // Type is mandatory.
            let ty = input.parse()?;

            // Optional default value.
            let default = if input.lookahead1().peek(syn::Token![=]) {
                let _: syn::Token![=] = input.parse()?;
                Some(input.parse()?)
            } else {
                None
            };

            // Optional example value.
            let example = attrs.iter()
                .position(|attr| attr.path.is_ident("example"))
                .map(|i| {
                    let attr = attrs.remove(i);
                    parse_attr_value::<Expr>(attr.tokens)
                })
                .transpose()?;

            if example.is_none() && default.is_none() {
                let msg = "either a default value or an example value has to be specified";
                return Err(Error::new(name.span(), msg));
            }

            Self::Leaf { doc, name, ty, default, example }
        };

        assert_no_extra_attrs(&attrs)?;

        Ok(out)
    }
}

/// The kinds of expressions (just literals) we allow for default or example
/// values.
#[derive(Debug)]
enum Expr {
    Str(syn::LitStr),
    Int(syn::LitInt),
    Float(syn::LitFloat),
    Bool(syn::LitBool),
}

impl Parse for Expr {
    fn parse(input: ParseStream) -> Result<Self, syn::Error> {
        let lit = input.parse::<syn::Lit>()?;
        let out = match lit {
            syn::Lit::Str(l) => Self::Str(l),
            syn::Lit::Int(l) => Self::Int(l),
            syn::Lit::Float(l) => Self::Float(l),
            syn::Lit::Bool(l) => Self::Bool(l),

            _ => {
                let msg = "only string, integer, float and bool literals are allowed here";
                return Err(Error::new(lit.span(), msg));
            }
        };

        Ok(out)
    }
}

impl quote::ToTokens for Expr {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        match self {
            Self::Str(lit) => lit.to_tokens(tokens),
            Self::Int(lit) => lit.to_tokens(tokens),
            Self::Float(lit) => lit.to_tokens(tokens),
            Self::Bool(lit) => lit.to_tokens(tokens),
        }
    }
}

// This `Display` impl is for writing into a TOML file.
impl fmt::Display for Expr {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            // TODO: not sure if `escape_debug` is really what we want here, but
            // it's working for now.
            Self::Str(lit) => write!(f, "\"{}\"", lit.value().escape_debug()),
            Self::Int(lit) => lit.fmt(f),
            Self::Float(lit) => lit.fmt(f),
            Self::Bool(lit) => lit.value.fmt(f),
        }
    }
}

/// Makes sure that the given list is empty or returns an error otherwise.
fn assert_no_extra_attrs(attrs: &[syn::Attribute]) -> Result<(), Error> {
    if let Some(attr) = attrs.get(0) {
        let msg = "unknown/unexpected/duplicate attribute in this position";
        return Err(Error::new(attr.span(), msg));
    }

    Ok(())
}

/// Parses the tokenstream as a `T` preceeded by a `=`. This is useful for
/// attributes of the form `#[foo = <T>]`.
fn parse_attr_value<T: Parse>(tokens: TokenStream) -> Result<T, Error> {
    use syn::parse::Parser;

    fn parser<T: Parse>(input: ParseStream) -> Result<T, Error> {
        let _: syn::Token![=] = input.parse()?;
        input.parse()
    }

    parser.parse2(tokens)
}

/// Extract all doc attributes from the list and return them as simple strings.
fn extract_doc(attrs: &mut Vec<syn::Attribute>) -> Result<Vec<String>, Error> {
    let out = attrs.iter()
        .filter(|attr| attr.path.is_ident("doc"))
        .map(|attr| parse_attr_value::<syn::LitStr>(attr.tokens.clone()).map(|lit| lit.value()))
        .collect::<Result<_, _>>()?;

    // I know this is algorithmically not optimal, but `drain_filter` is still
    // unstable and I can't be bothered to write the proper algorithm right now.
    attrs.retain(|attr| !attr.path.is_ident("doc"));

    Ok(out)
}

/// Checks if the given type is an `Option` and if so, return the inner type.
///
/// Note: this function clearly shows one of the major shortcomings of proc
/// macros right now: we do not have access to the compiler's type tables and
/// can only check if it "looks" like an `Option`. Of course, stuff can go
/// wrong. But that's the best we can do and it's highly unlikely that someone
/// shadows `Option`.
fn as_option(ty: &syn::Type) -> Option<&syn::Type> {
    let ty = match ty {
        syn::Type::Path(path) => path,
        _ => return None,
    };

    if ty.qself.is_some() || ty.path.leading_colon.is_some() {
        return None;
    }

    let valid_paths = [
        &["Option"] as &[_],
        &["std", "option", "Option"],
        &["core", "option", "Option"],
    ];
    if !valid_paths.iter().any(|vp| ty.path.segments.iter().map(|s| &s.ident).eq(*vp)) {
        return None;
    }

    let args = match &ty.path.segments.last().unwrap().arguments {
        syn::PathArguments::AngleBracketed(args) => args,
        _ => return None,
    };

    if args.args.len() != 1 {
        return None;
    }

    match &args.args[0] {
        syn::GenericArgument::Type(t) => Some(t),
        _ => None,
    }
}
