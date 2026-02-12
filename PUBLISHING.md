# Publishing Guide

This document explains how to publish `go-go-scope` to npm.

## Prerequisites

1. **npm account** with access to the `go-go-scope` package
2. **Logged in to npm**: Run `npm login` and verify with `npm whoami`

## Before Publishing

### 1. Run Full Test Suite

```bash
npm test
```

This runs:
- Build
- Lint
- All tests

### 2. Verify Build Output

```bash
npm run build
ls -la dist/
```

Ensure these files exist:
- `index.mjs` (ESM build)
- `index.cjs` (CommonJS build)
- `index.d.mts` (ESM types)
- `index.d.cts` (CommonJS types)

### 3. Check Version

Current version is in `package.json`:

```bash
grep '"version"' package.json
```

### 4. Review Changes

Check what has changed since last release:

```bash
git log --oneline HEAD...$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)
```

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Minor** (1.0.0 → 1.1.0): New features, backwards compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

## Publishing

### Option 1: Automated Scripts (Recommended)

```bash
# Patch release (bug fixes)
npm run publish:patch

# Minor release (new features)
npm run publish:minor

# Major release (breaking changes)
npm run publish:major
```

These scripts:
1. Run tests
2. Bump version
3. Create git tag
4. Publish to npm

### Option 2: Manual Steps

```bash
# 1. Run tests
npm test

# 2. Bump version (choose one)
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0

# 3. Publish to npm
npm publish

# 4. Push git tags
git push --follow-tags
```

## After Publishing

### Verify on npm

Check the package page:
https://www.npmjs.com/package/go-go-scope

### Verify Installation

```bash
# Create temp directory
mkdir /tmp/test-go-go-scope && cd /tmp/test-go-go-scope

# Install package
npm init -y
npm install go-go-scope

# Test import
node -e "const { scope } = require('go-go-scope'); console.log('CommonJS:', typeof scope);"
node --input-type=module -e "import { scope } from 'go-go-scope'; console.log('ESM:', typeof scope);"

# Cleanup
cd /
rm -rf /tmp/test-go-go-scope
```

## Troubleshooting

### "You do not have permission"

Request access from package owner or check you're logged in:

```bash
npm whoami
npm login
```

### "Cannot publish over existing version"

Version already exists. Bump version:

```bash
npm version patch
npm publish
```

### "prepublishOnly" fails

Tests are failing. Fix them first:

```bash
npm test
```

### Build files missing

Ensure `dist/` is not excluded by `.npmignore`:

```bash
cat .npmignore | grep -v "^#" | grep -v "^$"
```

`dist/` should NOT be listed (it's in `.gitignore` but not `.npmignore`).

## Release Checklist

- [ ] All tests pass
- [ ] Build succeeds
- [ ] Version bumped appropriately
- [ ] CHANGELOG.md updated (if maintained)
- [ ] Published to npm
- [ ] Installation verified
- [ ] Git tags pushed

## Beta/Pre-releases

For beta versions:

```bash
npm version prerelease --preid=beta  # 1.0.0 → 1.0.1-beta.0
npm publish --tag beta
```

Users install with:

```bash
npm install go-go-scope@beta
```
