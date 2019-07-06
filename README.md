[![Build Status](https://travis-ci.com/foxbunny/transplexer-routing.svg?branch=master)](https://travis-ci.com/foxbunny/transplexer-routing)

# Transplexer routing

Routing library based on transplexer

## Overview

This library is intended to provide routing support to application using
[transplexer](https://github.com/foxbunny/transplexer).

The gist of how it works is that there are one or more pipes that emit routing
context objects on every 'popstate' event. Each context object contains
information about the current location, such as route name, arguments, query
and hash, and arbitrary payload associated with the route. Note that there is
no 'callback' anywhere. The route payload may be a function, but that is not a
requirement. This library tries to make the least amount of assumptions about
how you wish to use it.

The library has one important limitation that you should be aware of. It only
allows one routing table for the entire application (no nested routers, etc).
This is done primarily to simplify the implementation and reduce the potential
for complex setups.

## Contents

<!-- vim-markdown-toc GFM -->

* [Installation](#installation)
* [Usage](#usage)
  * [Route registration](#route-registration)
  * [Route context](#route-context)
  * [Creating the pipe](#creating-the-pipe)
  * [Handling the initial page](#handling-the-initial-page)
  * [Changing URLs](#changing-urls)

<!-- vim-markdown-toc -->

## Installation

Install from the NPM repository with NPM:

```bash
npm install --save-dev transplexer-routing
```

or with Yarn:

```bash
yarn add --dev transplexer-routing
```

## Usage

Routing table, an object containing a set of routes that are present in your
app, is set up when the application starts. Most application are unable to
start interacting with the user without this.

### Route registration

To set up new routes, we import the `register()` function and pass it the route
name, the URL pattern, and optionally some payload. We'll circle back to the
payload a bit later when we talk about handling routing events.

```javascript
import {register} from 'transplexer-routing';

register('main', '/');
register('about', '/about');
register('book', '/book/:id');
```

All routes have a name by which we can refer to them. This allows us to build
routes using the name and route parameters, for example. Names must be unique,
and it is an error to use the same name twice.

URL patterns is a path with optional path argument placeholders. Placeholders
look like `:abc` (colon followed by one or more alphanumeric characters or
underscore). Placeholders can appear anywhere in the path, and do not
necessarily have to take up an entire segment between consecutive slashes. For
instance, `/books/:slug-:id` is a perfectly valid URL pattern. Any data
appearing in the URL where the placeholders are found will be captured and made
available to the code handling the routing event under the same name as the
placeholder.

Routes can be registered in bulk using the `registerRoutes()`. This function
takes an array where each member is an array consisting of two or more members
that match the arguments of the `register()` function. For instance, the last
example can be written like this:

```javascript
import {registerRoutes} from 'transplexer-routing';

registerRoutes([
  ['main', '/'],
  ['about', '/about'],
  ['book', '/book/:id'],
]);
```

Just like the `register()` function, `registerRoutes()` can be called multiple
times, and will raise an exception when multiple routes with the same name are
specified.

### Route context

The route context deserves a section of its own as that is what you will use to
identify the state that is encoded in the address bar. Think of it as an object
version of the URL.

The route context object has the following keys:

- `name` - name of the route that matched.
- `payload` - the route payload.
- `args` - an object mapping route parameters to their values.
- `query` - an object containing query parameters.
- `hash` - an object containing hash parameters.

The `args`, `query`, and `hash` are all objects, key-value pairs that map
parameter names to one or more values (if there are multiple values for the
same parameter name, they are collected into an array). 

The `query` comes from the query string in the URL, and the `hash` comes the
from fragment identifier, or hash. Both `query` and `hash` are treated
identically, and they simply differ in the prefix (i.e., '?' for query strings,
and '#' for hashes).

The `payload` will be discussed later, but it's any value you pass as a payload
during registration.

To give you a concrete example, let's assume that routes are registered as in
the last example. Then an URL that looks like 
'/books/12?show=author&show=isbn#menu=1' is interpreted as the following 
object:

```javascript
{
  name: 'book',
  payload: null,
  args: {
    id: '12',
  },
  query: {
    show: ['author', 'isbn'],
  },
  hash: {
    menu: '1',
  },
}
```

### Creating the pipe

The primary mechanism for handling routes changes with this library is the
transplexer pipe. This pipes transmit route context objects every time there is
a route change.

To create a pipe, we use the `createPipe()` function:

```javascript
import {createPipe} from 'transplexer-routing';

let pipe = createPipe();

pipe.connect(function (context) {
  // do something with the context
});
```

There are two ways to customize the context. 

The first way is to customize it statically by providing the payload. Here's an
example of doing just that using 'page objects', made-up objects that contain
information about the pages we want to render.

```javascript
import {register, createPipe} from 'transplexer-routing';
import * as pages from './pages';

let currentPage;
let root = document.querySelector('#app');
let pipe = createPipe();

register('home', '/', pages.home);
register('about', '/about', pages.about);
register('book', '/book/:id', pages.book);

pipe.connect(function (context) {
  if (currentPage) {
    currentPage.stop();
  }

  currentPage = context.payload || pages.notFound;

  currentPage.start();
  let html = currentPage.render();
  root.innerHTML = '';
  root.appendChild(html);
});
```

Another way to customize the context is to use a transformer. We won't go too
much into how transformers are written and how they work as that is already
documented in the [transplexer
documentation](https://github.com/foxbunny/transplexer#transplexer). Instead,
we'll simply give an example here.

```javascript
import {register, createPipe} from 'transplexer-routing';
import * as pages from './pages';

function contextToPage(next) {
  return function (context) {
    next(pages[context.name] || pages.notFound);
  };
}

let currentPage;
let root = document.querySelector('#app');
let pipe = createPipe(contextToPage);

pipe.connect(function (page) {
  if (currentPage) {
    currentPage.stop();
  }

  currentPage = page;

  currentPage.start();
  let html = currentPage.render();
  root.innerHTML = '';
  root.appendChild(html);
});
```

The difference between these two may seem cosmetic, but they become quite
obvious when you take into account the fact that an application does not
necessarily have just one pipe. It's entirely valid to have multiple pipes that
work independent of each other, and depending on what you do with them, one or
the other approach may be better-suited.

### Handling the initial page

Once all the routes are set up, you may want to kick-start the router and cause
it to emit the initial state of the application right away. This is done by
manually triggering the `popstate` event. A handy shortcut for this is provided
in the form of the `start()` function.

```javascript
import {start} from 'transplexer-routing';

start();
```

### Changing URLs

You usually want to change the current URL (in other words 'go to another
page') when user does something. This could either be a click on a link, or a
button, or a redirect due to desired target not being available at that time.
To go to another URL at any moment, we can use the `go()` function.

```javascript
import {go} from 'transplexer-routing';

go('/about');
```

When `go()` is called, it updates the browser's history stack by adding the
specified URL to the end, which in turn sets the address bar to that URL. Then
it triggers the `popstate` event and causes the routing event to propagate
through the pipe(s).

Although `go()` takes a plain URL as a string, you don't normally want to pass
URLs directly. Instead, what you would do is calculate the URL for a particular
path dynamically. By doing that, you decouple the string that represents the
URL in the address bar from the internal name used to identify that string. If
you ever decide that the URL doesn't look good or there is a spelling error in
it, you can safely change it once where you registered it, and leave the rest
of the code base alone.

The last example of `go()` usage can be rewritten like so:

```javascript
import {go, register, url} from 'transplexer-routing';

register('about', '/about', pages.about);

go(url('about')); 
// '/about'
```

The first argument to `url()` is the name. An optional second argument is a
parameters object which may have one or more of the following properties:

- `args` - an object that maps route parameter names to their values. This
  object must be present if the route has parameters, and an exception is
  thrown if missing.
- `query` - an object representing query string parameters.
- `hash` - an object representing hash parameters.

If a path has any placeholders, the parameters object must be specified. This
object should have all path arguments as the `args` property. For example:

```javascript
import {go, register, url} from 'transplexer-routing';

register('book', '/book/:id', pages.book);

go(url('book', {args: {id: 34}}));
// '/book/34'
```

The query string and hash can also be added using the `url()`, in particular
the parameters object and its `query` and `hash` properties. Here is an
example:

```javascript
import {go, register, url} from 'transplexer-routing';

register('book', '/book/:id', pages.book);

go(url('book', {
  args: {id: 34},
  query: {
    show: ['author', 'isbn']
  },
  hash: {
    menu: 1,
    sidebar: 2,
  },
}));
// '/book/34?show=author&show=isbn#menu=1&sidebar=2'
```

