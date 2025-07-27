This package is a fork of [https://github.com/catdad/canvas-confetti](canvas-confetti). 

The idea came when I used canvas-confetti in a project of mine a long time ago back when canvas-confetti was still maintained.
I recognized lately that is no longer the case but I didn't like the alternatives as they were too complex and missed a lot of features.

This is why I chose to fork the package and modernize it, the differences I made in this fork are as follow:

- Remove support for old browsers that don't support Web Workers, Web workers are pretty much baseline now.
- Use modern tools like vite for bundling, eslint 9 with better linting config, and prettier for formatting.
- Upgraded CI to Node.js 22
- Separate web worker code from the main code
- Export both esm and cjs outputs

The breaking changes in this library are two things, first if you still need to support browsers that don't have Web Workers, you'll need to use the original library.

Second, this library avoids mixing default exports with named exports due to issues with Vite so all exports are named exports, the default export is now named `fireConfetti`.

I hope you enjoy this library, While I didn't publish it yet I intend to do so shortly.
