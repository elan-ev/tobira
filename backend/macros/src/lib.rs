use proc_macro::TokenStream as TokenStream1;


mod config;


/// Defines a configuration in a special syntax. TODO: explain what this
/// generates.
#[proc_macro]
pub fn gen_config(input: TokenStream1) -> TokenStream1 {
    config::run(input.into())
        .unwrap_or_else(|e| e.to_compile_error())
        .into()
}
