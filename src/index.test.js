import * as routing from './.';

let locOrig = Object.getOwnPropertyDescriptor(window, 'location');
let fakeLoc = {
  pathname: '/',
  search: '',
  hash: '',
};

beforeAll(function () {
  Object.defineProperty(window, 'location', {
    value: fakeLoc,
  });
});

afterAll(function () {
  Object.defineProperty(window, 'location', locOrig);
});

afterEach(function () {
  fakeLoc.pathname = '/';
  fakeLoc.search = '';
  fakeLoc.hash = '';
});

describe('toRouteRegexp', function () {

  test('simple pattern', function () {
    let {re, params} = routing.toPathRegExp('/foo');
    expect(re).toBeInstanceOf(RegExp);
    expect(params).toEqual([]);
  });

  test('single placeholder', function () {
    let {re, params} = routing.toPathRegExp('/foo/:id');
    expect(re).toBeInstanceOf(RegExp);
    expect(params).toEqual(['id'])
  });

  test('capture with parameters', function () {
    let {re, params} = routing.toPathRegExp('/foo/:id');
    let match = re.exec('/foo/1234');
    expect(match[1]).toBe('1234');
  });

  test('multiple paramters', function () {
    let {re, params} = routing.toPathRegExp('/foo/:slug/:id');
    expect(re).toBeInstanceOf(RegExp);
    expect(params).toEqual(['slug', 'id'])
  });

  test('capture with multiple paramters', function () {
    let {re} = routing.toPathRegExp('/foo/:slug/:id');
    let match = re.exec('/foo/old/1234');
    expect([].slice.call(match, 1)).toEqual(['old', '1234']);
  });

  test('multiple params in the same segment', function () {
    let {re, params} = routing.toPathRegExp('/foo/:slug-:id');
    expect(re).toBeInstanceOf(RegExp);
    expect(params).toEqual(['slug', 'id'])
  });

  test('match with two params in the same segment', function () {
    let {re} = routing.toPathRegExp('/foo/:slug-:id');
    let match = re.exec('/foo/old-1234');
    expect([].slice.call(match, 1)).toEqual(['old', '1234']);
  });

  test('no match', function () {
    let {re} = routing.toPathRegExp('/foo/:slug-:id');
    let match = re.exec('/foo/1234');
    expect(match).toBeNull();
  });
});

describe('register', function () {
  afterEach(function () {
    routing.__clearRouteTable();
  });

  test('register route', function () {
    routing.register('books', '/books/:id', 'payload');
    expect(routing.__getLookupTable()).toEqual({
      books: {
        params: [
          'id',
        ],
        pattern: '/books/:id',
        payload: 'payload',
      },
    })
  });

  test('throw on duplicate registration', function () {
    routing.register('books', '/books/:id', jest.fn());
    expect(function () {
      routing.register('books', '/books/:slug-:id', jest.fn());
    }).toThrow("Route with the name 'books' already registered");
  });
});

describe('match', function () {
  let homePage = jest.fn();
  let booksPage = jest.fn();

  beforeAll(function () {
    routing.register('home', '/', homePage);
    routing.register('books', '/books/:id', booksPage);
  });

  afterAll(function () {
    routing.__clearRouteTable();
  });

  test('return matched', function () {
    fakeLoc.pathname = '/';
    let matched = routing.match();
    expect(matched).toEqual({
      name: 'home',
      payload: homePage,
      args: {},
      query: {},
      hash: {},
    })
  });

  test('with paramters', function () {
    fakeLoc.pathname = '/books/abc1234';
    let matched = routing.match();
    expect(matched).toEqual({
      name: 'books',
      payload: booksPage,
      args: {id: 'abc1234'},
      query: {},
      hash: {},
    });
  });

  test('no match', function () {
    fakeLoc.pathname = '/about';
    let matched = routing.match();
    expect(matched).toEqual({});
  });
});

describe('registerRoutes', function () {
  afterEach(function () {
    routing.__clearRouteTable();
  });

  test('register routes', function () {
    let cb1 = jest.fn();
    let cb2 = jest.fn();

    routing.registerRoutes([
      ['home', '/', cb1],
      ['about', '/about', cb2],
    ]);

    expect(routing.__getLookupTable()).toEqual({
      home: {
        pattern: '/',
        payload: cb1,
        params: [],
      },
      about: {
        pattern: '/about',
        payload: cb2,
        params: [],
      },
    })
  });
});

describe('url', function () {
  beforeAll(function () {
    let cb1 = jest.fn();
    let cb2 = jest.fn();

    routing.registerRoutes([
      ['home', '/', cb1],
      ['books', '/books/:slug-:id', cb2],
    ]);
  });

  afterAll(function () {
    routing.__clearRouteTable();
  });

  test('url for a simple route', function () {
    expect(routing.url('home')).toBe('/');
  });

  test('url with query string', function () {
    expect(routing.url('home', {query: {filter: 'test'}}))
      .toBe('/?filter=test');
  });

  test('url with hash', function () {
    expect(routing.url('home', {hash: {menu: true}}))
      .toBe('/#menu=true');
  });

  test('hash comes after query', function () {
    expect(routing.url('home', {query: {filter: 'test'}, hash: {menu: true}}))
      .toBe('/?filter=test#menu=true');
  });

  test('path with args', function () {
    expect(routing.url('books', {args: {slug: 'old', id: '1234'}}))
      .toBe('/books/old-1234');
  });

  test('path with missing args', function () {
    expect(function () {
      routing.url('books');
    }).toThrow("No args given for 'books' but slug, id are expected");
  });

  test('do not break on missing routes', function () {
    expect(routing.url('missing')).toBe('missing');
  });

});

describe('go', function () {
  test('push the url', function () {
    let mockPush = jest.spyOn(window.history, 'pushState');
    routing.go('/test/1234');
    expect(mockPush).toHaveBeenCalledWith(null, '', '/test/1234');
    window.history.pushState.mockRestore();
  });

  test('trigger popstate', function () {
    let callback = jest.fn();
    window.addEventListener('popstate', callback);
    routing.go('/test/1234');
    expect(callback).toHaveBeenCalled();
    window.removeEventListener('popstate', callback);
  });
});

describe('createPipe', function () {
  let homePage = jest.fn();
  let booksPage = jest.fn();

  beforeAll(function () {
    routing.register('home', '/', homePage);
    routing.register('books', '/books/:id', booksPage);
  });

  afterAll(function () {
    routing.__clearRouteTable();
  });

  test('create a pipe', function () {
    let callback = jest.fn();
    let pipe = routing.createPipe();
    pipe.connect(callback);
    fakeLoc.pathname = '/books/12';
    window.dispatchEvent(new Event('popstate'));
    let context = callback.mock.calls[0][0];
    expect(context.name).toBe('books');
    expect(context.args).toEqual({id: '12'});
    pipe.stop();
  });

  test('use a custom transformer', function () {
    function trans(next) {
      return function (ctx) {
        if (ctx.args.id) {
          ctx.args.id = parseInt(ctx.args.id, 10);
        }
        next(ctx);
      };
    }
    let callback = jest.fn();
    let pipe = routing.createPipe(trans);
    pipe.connect(callback);
    fakeLoc.pathname = '/books/12';
    window.dispatchEvent(new Event('popstate'));
    let context = callback.mock.calls[0][0];
    expect(context.args).toEqual({id: 12});
    pipe.stop();
  });
});

describe('start', function () {
  test('trigger a popstate event', function () {
    let callback = jest.fn();
    window.addEventListener('popstate', callback, false);
    routing.start();
    expect(callback).toHaveBeenCalled();
    window.removeEventListener('popstate', callback, false);
  });
});
