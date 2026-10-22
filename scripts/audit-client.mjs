import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function compressScriptUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  let result = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const value = parseInt(hex.slice(i, i + 3), 16);
    result += alphabet[value >> 6] + alphabet[value & 63];
  }
  return result;
}
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

/** Static asset integrity only: does not invoke Creator or deserialize objects in the engine. */
export function auditClient(clientPath) {
  const client = resolve(clientPath), assets = join(client, 'assets');
  const project = read(join(client, 'package.json'));
  ensure(project.creator?.version === '3.8.8' && uuidPattern.test(project.uuid), 'Creator project/version/UUID is invalid');
  const files = [], directories = [];
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const target = join(path, entry.name);
      ensure(!entry.isSymbolicLink(), `Asset symlink needs explicit review: ${target}`);
      if (entry.isDirectory()) { directories.push(target); visit(target); }
      else files.push(target);
    }
  };
  visit(assets);
  const metadata = new Map(), classIds = new Map();
  const importer = { '.ts': 'typescript', '.scene': 'scene', '.prefab': 'prefab' };
  for (const path of [...directories, ...files.filter(file => !file.endsWith('.meta'))]) {
    ensure(existsSync(`${path}.meta`), `Missing .meta: ${relative(client, path)}`);
    const meta = read(`${path}.meta`);
    const expected = statSync(path).isDirectory() ? 'directory' : importer[extname(path)];
    ensure(!expected || meta.importer === expected, `Wrong importer: ${path}`);
    const register = item => {
      ensure(uuidPattern.test(item.uuid), `Invalid asset UUID: ${path}`);
      ensure(!metadata.has(item.uuid), `Duplicate asset UUID: ${item.uuid}`);
      metadata.set(item.uuid, { path, meta });
      for (const sub of Object.values(item.subMetas ?? {})) {
        // Cocos subassets may use root UUID@localId instead of a full independent UUID.
        if (uuidPattern.test(sub.uuid)) register(sub);
        else if (typeof sub.uuid === 'string') {
          ensure(!metadata.has(sub.uuid), `Duplicate subasset UUID: ${sub.uuid}`);
          metadata.set(sub.uuid, { path, meta });
        }
      }
    };
    register(meta);
    if (meta.importer === 'typescript') {
      const source = readFileSync(path, 'utf8');
      const classes = [...source.matchAll(/@ccclass\(['"]([^'"]+)['"]\)/g)];
      for (const [_, name] of classes) {
        ensure(![...classIds.values()].some(item => item.name === name), `Duplicate ccclass: ${name}`);
        classIds.set(compressScriptUuid(meta.uuid), { path, name });
      }
    }
  }
  for (const file of files.filter(file => file.endsWith('.meta'))) {
    ensure(existsSync(file.slice(0, -5)), `Orphan .meta: ${file}`);
  }
  const graphs = files.filter(file => ['.scene', '.prefab'].includes(extname(file)));
  for (const path of graphs) {
    const graph = read(path);
    ensure(Array.isArray(graph) && graph.length > 0, `Invalid serialized graph: ${path}`);
    const walk = (value, trail) => {
      if (!value || typeof value !== 'object') return;
      if ('__id__' in value) ensure(Number.isInteger(value.__id__) && value.__id__ >= 0 &&
        value.__id__ < graph.length, `Dangling __id__ at ${trail}`);
      if ('__uuid__' in value) ensure(metadata.has(value.__uuid__), `Unresolved asset UUID ${value.__uuid__} at ${trail}`);
      if (value.__type__ && !value.__type__.startsWith('cc.')) {
        ensure(classIds.has(value.__type__), `Missing script component ${value.__type__} at ${trail}`);
      }
      for (const [key, child] of Object.entries(value)) walk(child, `${trail}.${key}`);
    };
    walk(graph, basename(path));
    for (let i = 0; i < graph.length; i++) {
      const item = graph[i];
      if (item.__type__ === 'cc.Node' || item.__type__ === 'cc.Scene') {
        for (const child of item._children ?? []) ensure(graph[child.__id__]?._parent?.__id__ === i, `Node parent mismatch: ${path}#${i}`);
        for (const component of item._components ?? []) ensure(graph[component.__id__]?.node?.__id__ === i, `Component owner mismatch: ${path}#${i}`);
      }
    }
  }
  const home = read(join(assets, 'Home.scene'));
  const homeMeta = read(join(assets, 'Home.scene.meta'));
  ensure(home[0].__type__ === 'cc.SceneAsset' && home[home[0].scene?.__id__]?.__type__ === 'cc.Scene', 'Home is not a SceneAsset/Scene');
  ensure(home[home[0].scene.__id__]._id === homeMeta.uuid, 'Home scene UUID does not match .meta');
  const bootstrapId = home.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'Bootstrap');
  ensure(bootstrapId >= 0 && home[bootstrapId]._active, 'Missing or inactive Bootstrap');
  const component = home.find(item => classIds.get(item.__type__)?.name === 'PlanetGame');
  ensure(component && component.node?.__id__ === bootstrapId && component._enabled &&
    home[bootstrapId]._components.some(ref => home[ref.__id__] === component), 'PlanetGame is not bound to Bootstrap');
  for (const slot of ['playerOneVisual', 'playerTwoVisual', 'roomVisual', 'plantVisual', 'stoolVisual', 'tableVisual']) {
    ensure(Object.hasOwn(component, slot), `Missing optional art binding: ${slot}`);
    const ref = component[slot];
    if (ref === null) continue;
    ensure(ref && metadata.get(ref.__uuid__)?.meta.importer === 'prefab', `Art binding must reference a prefab: ${slot}`);
    if (slot === 'playerOneVisual' || slot === 'playerTwoVisual') {
      const prefab = read(metadata.get(ref.__uuid__).path);
      const root = prefab[prefab[0]?.data?.__id__];
      ensure(root?._components?.some(r => classIds.get(prefab[r.__id__]?.__type__)?.name === 'CharacterView'),
        `${slot} prefab root has no CharacterView`);
    }
  }
  const settings = read(join(client, 'settings/v2/packages/project.json'));
  ensure(settings.general?.designResolution?.width === 390 && settings.general?.designResolution?.height === 844,
    'Portrait project design resolution is missing');
  return { assets: metadata.size, graphs: graphs.length, components: classIds.size,
    formalArtBindings: ['playerOneVisual', 'playerTwoVisual'].filter(key => component[key] !== null).length };
}
