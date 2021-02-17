declare module "*.yaml" {
    const value: any;
    export default value;
}

declare module "*.svg" {
    const Component: React.FC<React.SVGProps<SVGSVGElement>>;
    export default Component;
}

declare module "*.css" {
    const value: string;
    export default value;
}
