declare module "*.yaml" {
    const value: unknown;
    export default value;
}

declare module "*.svg?react" {
    const Component: React.FC<React.SVGProps<SVGSVGElement>>;
    export default Component;
}
