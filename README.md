# Dep Trace

This is a tiny tool to find a installed dependency location in your project.

Imagine you are working in a framework like Next.js or Modern.js, maybe you want to debug into the `ts-loader` or `babel-loader` under that framework, and you are using pnpm workspace, it would be hard to find the package location, like `~/my-app/node_modules/.pnpm/picocolors@1.0.0/node_modules/picocolors`.
So you can use this little tool to help you, just type `dep-tracer picocolors` at your project root, or you can be more accurate, ` dep-tracer next postcss picocolors`,

## Usage

```bash
dep-tracer next postcss picocolors  

# output like
Found:
Locations: /my-app/node_modules/.pnpm/picocolors@1.0.0/node_modules/picocolors
Through: next > postcss > picocolors

Cost: 13ms
```

Or you can use `dt` as alias

```bash
dt next postcss picocolors
```

## Note

If you are trying to locate a dep from `depA > depB > depC > depD > depE > target`, if you give it `target` as only input, it will fail as the dependency chain is too deep.

But you can provide more detail information, like `depC target`, when it reached dependency `depC`, it will reset depth 0, so it can continue resolving, and succeed to resolve `target`.

The more detail you provide, the faster it can run.
