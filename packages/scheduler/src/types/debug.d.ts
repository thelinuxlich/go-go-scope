declare module "debug" {
	function debug(namespace: string): (...args: unknown[]) => void;
	export default debug;
}
