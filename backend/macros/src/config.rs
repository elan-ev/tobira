//! A proc macro to easily and concisely define the configuration for Tobira.
//!
//! I thought a lot about configuration and as far as I see it, a proc macro is
//! basically required to avoid duplicate code, docs or values.

use proc_macro2::TokenStream;
use quote::quote;
use syn::{
    Error,
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    spanned::Spanned,
};
use std::fmt::{self, Write};


/// Entry point: parses the input and generates output.
pub(crate) fn run(input: TokenStream) -> Result<TokenStream, Error> {
    let input = syn::parse2::<Input>(input)?;

    let toml = gen_toml(&input);

    Ok(quote! {
        const TOML: &str = #toml;
    })
}


// ==============================================================================================
// ===== Generating the output
// ==============================================================================================

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
                        writeln!(out, "# Required: this value must be specified!").unwrap();
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
