export function onRequest(context) {
  // Service bindings keep the browser on its Pages origin, including the WebSocket upgrade.
  // Worker overwrites identity headers and checks the original browser Origin.
  return context.env.PLANET_SERVICE.fetch(context.request);
}
