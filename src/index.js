import qs from 'query-string';
import pipe from 'transplexer';

/**
 * Remove double, leading and trailing slashes
 */
function cleanPath(path) {
  return path
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .replace(/\/\//g, '/');
}

/**
 * Convert a URL pattern to a regexp
 *
 * A pattern is a string that looks like an URL but optionally contains
 * placeholders which look like `:abc`. The characters after colon may contain
 * any number of alphanumeric characters or underscores. For example:
 *
 *     /books/:id
 *
 * The restriction on the kind of characters used in placeholder names allows
 * us to have multiple placeholders between a set of two slashes. For example:
 *
 *     /books/:slug-:id
 *
 * In the above example, the `slug` and `id` are considered separately
 * because neither dash nor colon can be used as part of a placeholder name.
 */
export function toPathRegExp(pattern) {
  let params = [];

  // Replace all parameter placeholders into appropriate regexp patterns. While
  // doing so, capture parameter names.
  let regexpString = (
    '^' +
    pattern
      .replace(/:(\w+)/g, function (_match, param) {
        params.push(param);
        return '(.+?)'
      })
      .replace(/\//g, '\\/') +
    '$'
  );

  return {
    re: new RegExp(regexpString),
    params: params,
  }
};

// Array holding route regexps and the matching names, which is looked up in
// order when searching for a matching route.
let matchingTable = [];

// Mapping between the route name and route details such as the callback
// function and parameter list.
let lookupTable = {};

/**
 * Clear the registered routes
 *
 * This function is meant for use during tested, and should not be invoked in
 * your application code.
 */
export function __clearRouteTable() {
  matchingTable.length = 0;
  for (let key in lookupTable) {
    delete lookupTable[key];
  }
};

/**
 * Get the lookup table
 *
 * This function is meant for use during tested, and should not be invoked in
 * your application code.
 */
export function __getLookupTable() {
  return lookupTable;
};

/**
 * Register a named URL pattern and its payload
 *
 * The name is the first argument, and is a string by which the route should be
 * identified. It should be unique for all registered route. An attempt to
 * register a route with the same name twice will result in a runtime
 * exception.
 *
 * The second argument, the URL pattern, is a string, and may contain any
 * number of placeholders. These are populated by characters found in those
 * locations within an actual URL. Placeholders are named, and the names may
 * contain any number of letters, numbers, and underscores. Other characters
 * are not permitted.
 *
 * The last argument is the payload, and it is optional. It can be any valid
 * JavaScript value. When omitted, the payload is `null`.
 *
 * In the following example, we have two placeholders, 'slug' and 'id'. Note
 * that they appear inside the same path segment because the `-` character is
 * not considered to be part of an identifier name and serves as a separator.
 *
 *     register('bookAuthor', '/books/:slug-:id/author', author);
 *
 */
export function register(name, pattern, payload = null) {
  if (lookupTable.hasOwnProperty(name)) {
    throw Error(`Route with the name '${name}' already registered`);
  }

  let {re, params} = toPathRegExp(pattern);

  matchingTable.push({re, name});
  lookupTable[name] = {
    pattern,
    payload,
    params,
  };
};

/**
 * Find the route that matches the current path and return a routing context
 *
 * It takes a `location`-like object as its only argument. In particular, the
 * object is expected to have `pathname`, `search` and `hash` properties.
 *
 * The routing context is an object that has the following properties:
 *
 * - `name` - name of the route that matched.
 * - `payload` - the route payload.
 * - `args` - an object mapping route parameters to their values.
 * - `query` - an object containing query parameters.
 * - `hash` - an object containing hash parameters.
 */
export function match({pathname, search, hash}) {
  for (let i = 0, l = matchingTable.length; i < l; i++) {
    let {re, name} = matchingTable[i];
    let reMatch = re.exec(pathname);

    if (reMatch == null) {
      continue;
    }

    let route = lookupTable[name];

    // Convert the captured arguments into an object using route's parameter
    // names
    let capturedArgs = [].slice.call(reMatch, 1);
    let args = {};
    route.params.forEach(function (paramName, index) {
      args[paramName] = capturedArgs[index];
    });

    let query = qs.parse(search);
    let hash = qs.parse(hash);

    return {
      name,
      payload: route.payload,
      args,
      query,
      hash,
    };
  }

  // Nothing matched
  return {};
};

/**
 * Register routes
 *
 * Routes are specified as an array of 3-member arrays. Each inner array
 * should have the following three items:
 *
 * - The route name.
 * - The URL pattern.
 * - The route payload.
 *
 * For example:
 *
 *     createRouter([
 *       ['home', '/', pages.home],
 *       ['books', '/books', pages.books],
 *     ])
 *
 * An optional page decorator can be specified as the second argument.
 */
export function registerRoutes(routes) {
  for (let i = 0, l = routes.length; i < l; i++) {
    let [name, path, callback] = routes[i];
    register(name, path, callback);
  }
};

/**
 * Look up a route by name and returns a string URL
 *
 * The function takes two arguments, the name of the route, and, optionally,
 * its parameters. The parameters object has the following keys:
 *
 * - `args` - an object that maps route parameter names to their values. This
 *   object must be present if the route has parameters, and an exception is
 *   thrown if missing.
 * - `query` - an object representing query string parameters.
 * - `hash` - an object representing hash parameters.
 */
export function url(name, parameters) {
  parameters = parameters || {};

  let route = lookupTable[name];

  if (route == null) {
    return name;
  }

  let url = route.pattern;

  // Add any route params
  if (route.params.length) {
    if (parameters.args == null) {
      throw Error(`No args given for '${name}' but ${route.params.join(', ')} are expected`);
    }

    route.params.forEach(function (paramName) {
      url = url.replace(`:${paramName}`, parameters.args[paramName]);
    });
  }

  if (parameters.query) {
    url += `?${qs.stringify(parameters.query)}`;
  }

  if (parameters.hash) {
    url += `#${qs.stringify(parameters.hash)}`;
  }

  return url;
};

/**
 * Modify browser history and emit the `routing.update` event
 */
export function go(url) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new Event('popstate'));
};

/**
 * Transformer that transmits the location object
 */
function locationTransformer(next) {
  return function () {
    next({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
  };
}

/**
 * Transformer that ignores any input and transmits a routing context object
 */
function matchTransformer(next) {
  return function (...args) {
    next(match(...args));
  };
}

/**
 * A no-op transformer that is used when no transformer is supplied by user
 */
function noopTransformer(next) {
  return next;
}

/**
 * Creates a pipe that emits routing context object on every routing event
 *
 * The routing context is an object that has the following properties:
 *
 * - `name` - name of the route that matched.
 * - `payload` - the route payload.
 * - `args` - an object mapping route parameters to their values.
 * - `query` - an object containing query parameters.
 * - `hash` - an object containing hash parameters.
 *
 * Note that, although there may be multiple pipes in an application, each pipe
 * uses the same global routing table as all other pipes, so one is usually
 * enough. On the other hand, there is no need to use the same pipe
 * everywhere if your application is better served by multiple pipes.
 *
 * Returns a transplexer pipe object with `stop()` method that stops the event
 * listener.
 *
 * This function takes an optional transformer.  The transformer will receve a
 * `location` object and is expected to transmit an `location` object or an
 * object that has compatible properties (at the very least, `pathname`,
 * `search` and `hash`). This can be useful to customize the location prior to
 * matching.
 */
export function createPipe(transformer = noopTransformer) {
  let routingPipe = pipe(
    locationTransformer,
    transformer,
    matchTransformer
  );
  window.addEventListener('popstate', routingPipe.send, false);
  routingPipe.stop = function () {
    window.removeEventListener('popstate', routingPipe.send, false);
  };
  return routingPipe;
};

/**
 * Manually dispatch a popstate event, usually to kick-start the router
 */
export function start() {
  window.dispatchEvent(new Event('popstate'));
};
