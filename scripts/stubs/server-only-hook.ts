// Hook to stub server-only module
export async function load(url: string, context: any, nextLoad: any) {
  if (url.includes("server-only")) {
    return {
      format: "commonjs",
      shortCircuit: true,
      source: "module.exports = {};",
    };
  }
  return nextLoad(url, context);
}
