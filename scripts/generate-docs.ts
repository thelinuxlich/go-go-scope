#!/usr/bin/env tsx
/**
 * Documentation Generator for go-go-scope
 *
 * This script:
 * 1. Parses all TypeScript source files in the packages
 * 2. Extracts JSDoc comments from exported functions/classes
 * 3. Generates Markdown documentation organized by package
 * 4. Creates a searchable index for all APIs
 * 5. Generates docs/03-api-reference.md overview
 * 6. Updates docs/index.html with API reference section
 */

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, relative, dirname, basename } from "node:path";
import * as ts from "typescript";

interface DocEntry {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "method" | "property";
  signature?: string;
  description: string;
  examples: string[];
  params: Array<{ name: string; type: string; description: string; optional: boolean }>;
  returns?: { type: string; description: string };
  typeParameters?: string[];
  file: string;
  line: number;
  package: string;
  tags: Record<string, string>;
}

interface PackageDocs {
  name: string;
  description: string;
  exports: DocEntry[];
}

/**
 * Truncate text at word boundary, adding ellipsis if truncated
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // Find the last space within the limit
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  // If no space found, just truncate with ellipsis
  if (lastSpace === -1) return truncated + '...';
  
  // Truncate at word boundary
  return truncated.slice(0, lastSpace) + '...';
}

/**
 * Clean up description for Quick Reference display
 * - Removes compiler directives like #__PURE__
 * - Removes TypeScript directives like // @ts-expect-error
 * - Extracts first sentence for brevity
 * - Cleans up extra whitespace
 */
function cleanQuickRefDescription(description: string): string {
  if (!description) return "";
  
  // Remove compiler directives
  let cleaned = description
    .replace(/#__PURE__/g, '')
    .replace(/\/\/\s*@ts-expect-error.*/g, '');
  
  // Get first sentence (up to first period followed by space or end)
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]/);
  if (firstSentence) {
    cleaned = firstSentence[0].trim();
  }
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

const PACKAGES_DIR = "packages";
const OUTPUT_DIR = "docs/api";
const DOCS_DIR = "docs";

/**
 * Recursively find all TypeScript files in a directory
 */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      files.push(...(await findTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse JSDoc comments from a TypeScript node
 */
function parseJSDoc(node: ts.Node, sourceFile: ts.SourceFile): Partial<DocEntry> {
  const jsDocTags = ts.getJSDocTags(node);
  const jsDocComment = ts.getJSDocCommentsAndTags(node);

  let description = "";
  const examples: string[] = [];
  const tags: Record<string, string> = {};

  // Get description from JSDoc comment (exclude @example blocks - handled by tags)
  const commentRanges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart());
  if (commentRanges) {
    for (const range of commentRanges) {
      const comment = sourceFile.text.substring(range.pos, range.end);
      // Extract description only (lines not starting with @)
      const lines = comment.split("\n");
      let skipSection = false;
      
      for (const line of lines) {
        // Remove JSDoc comment markers and leading asterisks
        let trimmed = line.trim()
          .replace(/^\/\*\*?/, "")     // Remove /**
          .replace(/\*\/$/, "")         // Remove */
          .replace(/^\*\s?/, "")        // Remove leading * 
          .trim();

        // Skip empty lines and JSDoc markers
        if (trimmed === "" || trimmed === "*/") continue;
        
        // Skip @example and subsequent lines until next @tag or end of comment
        if (trimmed.startsWith("@example")) {
          skipSection = true;
          continue;
        }
        
        // End skip when we hit another @tag
        if (skipSection && trimmed.startsWith("@")) {
          skipSection = false;
        }
        
        if (skipSection) continue;
        
        // Add to description (skip @tags)
        if (!trimmed.startsWith("@")) {
          description += trimmed + " ";
        }
      }
    }
  }

  // Parse JSDoc tags
  for (const tag of jsDocTags) {
    const tagName = tag.tagName.text;
    const tagText = ts.getTextOfJSDocComment(tag.comment) ?? "";

    if (tagName === "example") {
      examples.push(tagText);
    } else {
      tags[tagName] = tagText;
    }
  }

  return { description: description.trim(), examples, tags };
}

/**
 * Extract parameter information from a function-like node
 */
function extractParameters(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.ConstructorDeclaration,
  sourceFile: ts.SourceFile,
): DocEntry["params"] {
  const params: DocEntry["params"] = [];

  for (const param of node.parameters) {
    const name = param.name.getText(sourceFile);
    const type = param.type?.getText(sourceFile) ?? "unknown";
    const optional = param.questionToken !== undefined || param.initializer !== undefined;

    // Get parameter description from JSDoc
    const jsDocParam = ts.getJSDocParameterTags(param);
    let description = "";
    if (jsDocParam.length > 0 && jsDocParam[0]?.comment) {
      description = ts.getTextOfJSDocComment(jsDocParam[0].comment) ?? "";
    }

    params.push({ name, type, description, optional });
  }

  return params;
}

/**
 * Extract return type information
 */
function extractReturnType(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
  sourceFile: ts.SourceFile,
): DocEntry["returns"] | undefined {
  const returnType = node.type?.getText(sourceFile);
  if (!returnType) return undefined;

  // Get return description from JSDoc
  const jsDocReturn = ts.getJSDocReturnTag(node);
  const description = jsDocReturn?.comment ? ts.getTextOfJSDocComment(jsDocReturn.comment) ?? "" : "";

  return { type: returnType, description };
}

/**
 * Process a source file and extract documentation
 */
function processSourceFile(filePath: string, sourceFile: ts.SourceFile, packageName: string): DocEntry[] {
  const docs: DocEntry[] = [];

  function visit(node: ts.Node) {
    // Skip private/internal members
    if (ts.isPrivateIdentifier(node) || hasInternalTag(node)) {
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const jsDoc = parseJSDoc(node, sourceFile);
      if (hasDocumentation(node)) {
        docs.push({
          name: node.name.text,
          kind: "function",
          signature: getSignature(node, sourceFile),
          description: jsDoc.description ?? "",
          examples: jsDoc.examples ?? [],
          params: extractParameters(node, sourceFile),
          returns: extractReturnType(node, sourceFile),
          typeParameters: node.typeParameters?.map((tp) => tp.getText(sourceFile)),
          file: filePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          package: packageName,
          tags: jsDoc.tags ?? {},
        });
      }
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const jsDoc = parseJSDoc(node, sourceFile);
      if (hasDocumentation(node)) {
        docs.push({
          name: node.name.text,
          kind: "class",
          signature: `class ${node.name.text}${node.typeParameters ? `<${node.typeParameters.map((tp) => tp.getText(sourceFile)).join(", ")}>` : ""}`,
          description: jsDoc.description ?? "",
          examples: jsDoc.examples ?? [],
          params: [],
          file: filePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          package: packageName,
          tags: jsDoc.tags ?? {},
        });
      }

      // Process class members
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const memberJsDoc = parseJSDoc(member, sourceFile);
          if (hasDocumentation(member)) {
            docs.push({
              name: `${node.name.text}.${member.name.text}`,
              kind: "method",
              signature: getMethodSignature(member, sourceFile, node.name.text),
              description: memberJsDoc.description ?? "",
              examples: memberJsDoc.examples ?? [],
              params: extractParameters(member, sourceFile),
              returns: extractReturnType(member, sourceFile),
              file: filePath,
              line: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1,
              package: packageName,
              tags: memberJsDoc.tags ?? {},
            });
          }
        }
      }
    }

    if (ts.isInterfaceDeclaration(node) && node.name && hasDocumentation(node)) {
      const jsDoc = parseJSDoc(node, sourceFile);
      docs.push({
        name: node.name.text,
        kind: "interface",
        signature: `interface ${node.name.text}`,
        description: jsDoc.description ?? "",
        examples: jsDoc.examples ?? [],
        params: [],
        file: filePath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        package: packageName,
        tags: jsDoc.tags ?? {},
      });
    }

    if (ts.isTypeAliasDeclaration(node) && hasDocumentation(node)) {
      const jsDoc = parseJSDoc(node, sourceFile);
      docs.push({
        name: node.name.text,
        kind: "type",
        signature: `type ${node.name.text} = ${node.type.getText(sourceFile)}`,
        description: jsDoc.description ?? "",
        examples: jsDoc.examples ?? [],
        params: [],
        file: filePath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        package: packageName,
        tags: jsDoc.tags ?? {},
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return docs;
}

/**
 * Check if a node has @internal tag
 */
function hasInternalTag(node: ts.Node): boolean {
  const tags = ts.getJSDocTags(node);
  return tags.some((tag) => tag.tagName.text === "internal");
}

/**
 * Check if a node has any documentation
 */
function hasDocumentation(node: ts.Node): boolean {
  const jsDoc = ts.getJSDocCommentsAndTags(node);
  return jsDoc.length > 0;
}

/**
 * Get function signature
 */
function getSignature(node: ts.FunctionDeclaration | ts.ArrowFunction, sourceFile: ts.SourceFile): string {
  const name = ts.isFunctionDeclaration(node) ? node.name?.text ?? "anonymous" : "anonymous";
  const typeParams = node.typeParameters ? `<${node.typeParameters.map((tp) => tp.getText(sourceFile)).join(", ")}>` : "";
  const params = node.parameters.map((p) => p.getText(sourceFile)).join(", ");
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";

  return `function ${name}${typeParams}(${params})${returnType}`;
}

/**
 * Get method signature
 */
function getMethodSignature(node: ts.MethodDeclaration, sourceFile: ts.SourceFile, className: string): string {
  const name = ts.isIdentifier(node.name) ? node.name.text : "anonymous";
  const typeParams = node.typeParameters ? `<${node.typeParameters.map((tp) => tp.getText(sourceFile)).join(", ")}>` : "";
  const params = node.parameters.map((p) => p.getText(sourceFile)).join(", ");
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";

  return `${className}.${name}${typeParams}(${params})${returnType}`;
}

/**
 * Generate Markdown documentation for a package
 */
function generatePackageMarkdown(docs: DocEntry[], packageName: string): string {
  const groups = groupByKind(docs);

  let markdown = `# ${packageName} API Reference\n\n`;
  markdown += `> Auto-generated documentation for ${packageName}\n\n`;

  // Table of contents
  markdown += "## Table of Contents\n\n";
  for (const [kind, items] of Object.entries(groups)) {
    if (items.length > 0) {
      // Handle pluralization properly (Class -> Classes, not Classs)
      const pluralKind = kind === "Class" ? "Classes" : `${kind}s`;
      markdown += `- [${pluralKind}](#${pluralKind})\n`;
      for (const item of items) {
        markdown += `  - [${item.name}](#${item.name.toLowerCase().replace(/\./g, "-")})\n`;
      }
    }
  }
  markdown += "\n";

  // Generate sections for each kind
  for (const [kind, items] of Object.entries(groups)) {
    if (items.length === 0) continue;

    // Handle pluralization properly (Class -> Classes, not Classs)
    const pluralKind = kind === "Class" ? "Classes" : `${kind}s`;
    markdown += `## ${pluralKind}\n\n`;

    for (const item of items) {
      markdown += generateEntryMarkdown(item);
    }
  }

  return markdown;
}

/**
 * Group documentation entries by kind
 */
function groupByKind(docs: DocEntry[]): Record<string, DocEntry[]> {
  const groups: Record<string, DocEntry[]> = {
    Function: [],
    Class: [],
    Interface: [],
    Type: [],
    Method: [],
  };

  for (const doc of docs) {
    const kind = doc.kind.charAt(0).toUpperCase() + doc.kind.slice(1);
    if (!groups[kind]) groups[kind] = [];
    groups[kind].push(doc);
  }

  return groups;
}

/**
 * Generate Markdown for a single documentation entry
 */
function generateEntryMarkdown(entry: DocEntry): string {
  let md = `### ${entry.name}\n\n`;

  if (entry.signature) {
    md += "```typescript\n";
    md += `${entry.signature}\n`;
    md += "```\n\n";
  }

  if (entry.description) {
    md += `${entry.description}\n\n`;
  }

  if (entry.params.length > 0) {
    md += "**Parameters:**\n\n";
    md += "| Name | Type | Description |\n";
    md += "|------|------|-------------|\n";
    for (const param of entry.params) {
      const optional = param.optional ? " (optional)" : "";
      md += `| \`${param.name}\`${optional} | \`${param.type}\` | ${param.description} |\n`;
    }
    md += "\n";
  }

  if (entry.returns) {
    md += `**Returns:** \`${entry.returns.type}\`\n\n`;
    if (entry.returns.description) {
      md += `${entry.returns.description}\n\n`;
    }
  }

  if (entry.examples.length > 0) {
    md += "**Examples:**\n\n";
    for (const example of entry.examples) {
      if (example.includes("```")) {
        md += `${example}\n\n`;
      } else {
        md += "```typescript\n";
        md += `${example}\n`;
        md += "```\n\n";
      }
    }
  }

  if (entry.tags && Object.keys(entry.tags).length > 0) {
    for (const [tag, value] of Object.entries(entry.tags)) {
      md += `**@${tag}:** ${value}\n\n`;
    }
  }

  md += `*Source: [${basename(entry.file)}:${entry.line}](${entry.file}#L${entry.line})*\n\n`;
  md += "---\n\n";

  return md;
}

/**
 * Generate search index JSON
 */
function generateSearchIndex(allDocs: DocEntry[]): string {
  const index = allDocs.map((doc) => ({
    name: doc.name,
    kind: doc.kind,
    package: doc.package,
    description: doc.description.slice(0, 200),
    file: doc.file,
  }));

  return JSON.stringify(index, null, 2);
}

/**
 * Generate main API index
 */
function generateMainIndex(allDocs: DocEntry[]): string {
  const packages = [...new Set(allDocs.map((d) => d.package))];

  let md = `# go-go-scope API Reference\n\n`;
  md += `> Complete API documentation for the go-go-scope monorepo\n\n`;

  md += "## Packages\n\n";
  for (const pkg of packages.sort()) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    md += `- [${pkg}](./${pkg}.md) - ${count} documented items\n`;
  }

  md += "\n## Quick Reference\n\n";

  // Most important functions
  const coreFunctions = allDocs.filter(
    (d) => d.kind === "function" && ["scope", "parallel", "race", "poll"].includes(d.name),
  );

  if (coreFunctions.length > 0) {
    md += "### Core Functions\n\n";
    for (const fn of coreFunctions) {
      md += `- **${fn.name}** - ${cleanQuickRefDescription(fn.description)}\n`;
    }
  }

  // Main classes
  const coreClasses = allDocs.filter((d) => d.kind === "class" && ["Scope", "Task", "Channel"].includes(d.name));

  if (coreClasses.length > 0) {
    md += "\n### Core Classes\n\n";
    for (const cls of coreClasses) {
      md += `- **${cls.name}** - ${cleanQuickRefDescription(cls.description)}\n`;
    }
  }

  md += "\n---\n\n";
  md += "*Generated automatically from JSDoc comments*\n";

  return md;
}

/**
 * Generate docs/03-api-reference.md - API reference overview
 */
function generateApiReferenceOverview(allDocs: DocEntry[]): string {
  const packages = [...new Set(allDocs.map((d) => d.package))];
  const now = new Date().toISOString().split("T")[0];

  // Categorize packages
  const corePackages = packages.filter((p) => p === "go-go-scope");
  const streamPackages = packages.filter((p) => p === "stream");
  const schedulerPackages = packages.filter((p) => p === "scheduler" || p === "scheduler-tui");
  const testingPackages = packages.filter((p) => p === "testing");
  const adapterPackages = packages.filter((p) => p.startsWith("adapter-"));
  const persistencePackages = packages.filter((p) => p.startsWith("persistence-"));
  const pluginPackages = packages.filter((p) => p.startsWith("plugin-"));
  const otherPackages = packages.filter(
    (p) => !corePackages.includes(p) &&
      !streamPackages.includes(p) &&
      !schedulerPackages.includes(p) &&
      !testingPackages.includes(p) &&
      !adapterPackages.includes(p) &&
      !persistencePackages.includes(p) &&
      !pluginPackages.includes(p)
  );

  // Count stats
  const totalItems = allDocs.length;
  const functionCount = allDocs.filter((d) => d.kind === "function").length;
  const classCount = allDocs.filter((d) => d.kind === "class").length;
  const streamOpCount = allDocs.filter((d) => d.package === "stream" && d.kind === "method").length;

  let md = `# API Reference

The API documentation is automatically generated from JSDoc comments in the source code. This ensures the documentation is always up-to-date and comprehensive.

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total Documented Items** | ${totalItems} |
| **Packages** | ${packages.length} |
| **Functions** | ${functionCount} |
| **Classes** | ${classCount} |
| **Stream Operators** | ${streamOpCount} |

## Core Packages

| Package | Description | Link |
|---------|-------------|------|
`;

  // Core packages table
  for (const pkg of [...corePackages, ...streamPackages, ...schedulerPackages, ...testingPackages]) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const descriptions: Record<string, string> = {
      "go-go-scope": "Core library - Scope, Task, Channel, and concurrency primitives",
      "stream": "Lazy stream processing with 50+ operators",
      "scheduler": "Distributed job scheduler with cron support",
      "scheduler-tui": "Interactive TUI for the scheduler",
      "testing": "Testing utilities and mock helpers",
    };
    md += `| **${pkg}** | ${descriptions[pkg] || ""} | [View API](./api/${pkg}.md) (${count} items) |\n`;
  }

  md += `
## Framework Adapters

| Package | Description | Link |
|---------|-------------|------|
`;

  for (const pkg of adapterPackages.sort()) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const name = pkg.replace("adapter-", "");
    md += `| **${pkg}** | ${name.charAt(0).toUpperCase() + name.slice(1)} integration | [View API](./api/${pkg}.md) (${count} items) |\n`;
  }

  md += `
## Persistence Adapters

| Package | Description | Link |
|---------|-------------|------|
`;

  for (const pkg of persistencePackages.sort()) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const name = pkg.replace("persistence-", "");
    md += `| **${pkg}** | ${name.charAt(0).toUpperCase() + name.slice(1)} adapter | [View API](./api/${pkg}.md) (${count} items) |\n`;
  }

  md += `
## Plugins

| Package | Description | Link |
|---------|-------------|------|
`;

  for (const pkg of pluginPackages.sort()) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const name = pkg.replace("plugin-", "").replace(/-/g, " ");
    md += `| **${pkg}** | ${name.charAt(0).toUpperCase() + name.slice(1)} | [View API](./api/${pkg}.md) (${count} items) |\n`;
  }

  if (otherPackages.length > 0) {
    md += `
## Other Packages

| Package | Description | Link |
|---------|-------------|------|
`;
    for (const pkg of otherPackages.sort()) {
      const count = allDocs.filter((d) => d.package === pkg).length;
      md += `| **${pkg}** | - | [View API](./api/${pkg}.md) (${count} items) |\n`;
    }
  }

  md += `
## Complete API Index

For a complete searchable index of all APIs across all packages, see the [API README](./api/README.md) or the [search index](./api/search-index.json).

## Core API Quick Reference

### Main Functions

`;

  // Add core functions
  const coreFunctions = allDocs.filter(
    (d) => d.kind === "function" && ["scope", "parallel", "race", "poll"].includes(d.name)
  );

  for (const fn of coreFunctions) {
    md += `- [\`${fn.name}()\`](./api/go-go-scope.md#${fn.name.toLowerCase()}) - ${fn.description}\n`;
  }

  md += `
### Core Classes

`;

  // Add core classes
  const coreClasses = allDocs.filter(
    (d) => d.kind === "class" && ["Scope", "Task", "Channel", "BroadcastChannel", "Semaphore", "CircuitBreaker"].includes(d.name)
  );

  for (const cls of coreClasses) {
    md += `- [\`${cls.name}<T>\`](./api/go-go-scope.md#${cls.name.toLowerCase()}) - ${cls.description}\n`;
  }

  md += `
### Type Aliases

- [\`Result<E, T>\`](./api/go-go-scope.md#result) - Error-first result tuple
- [\`Success<T>\`](./api/go-go-scope.md#success) - Success variant
- [\`Failure<E>\`](./api/go-go-scope.md#failure) - Failure variant

## Updating the API Documentation

The API documentation is automatically generated from JSDoc comments. To regenerate:

\`\`\`bash
pnpm docs:generate
\`\`\`

This will:
1. Parse all TypeScript source files in the \`packages/\` directory
2. Extract JSDoc comments from exported functions, classes, and types
3. Generate Markdown documentation in \`docs/api/\`
4. Create a searchable JSON index
5. Update this overview file (\`docs/03-api-reference.md\`)
6. Update the API section in \`docs/index.html\`

## Contributing to Documentation

When adding new functions or modifying existing ones:

1. Add comprehensive JSDoc comments with \`@example\` blocks
2. Document all object parameters using \`@param options.property\` notation
3. Include default values in parentheses: \`(default: 100)\`
4. Run \`pnpm docs:generate\` to update the API docs
5. Verify the generated documentation looks correct

---

*The API documentation is automatically generated from JSDoc comments. Last updated: ${now}*
`;

  return md;
}

/**
 * Update docs/index.html with the API reference section
 */
async function updateIndexHtml(allDocs: DocEntry[]): Promise<void> {
  const indexPath = join(DOCS_DIR, "index.html");

  try {
    const content = await readFile(indexPath, "utf-8");

    // Generate new API section
    const apiSection = generateApiSection(allDocs);

    // Find and replace the API section
    const startMarker = "<!-- API Reference Section - Links to Auto-Generated Documentation -->";
    const endMarker = "<!-- /API Reference Section -->";

    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
      console.log("   ⚠️  Could not find API section marker in index.html");
      return;
    }

    // Find the end of the section (next </section> tag after startMarker)
    const sectionStart = content.lastIndexOf("<section", startIndex);
    const sectionEnd = content.indexOf("</section>", startIndex) + "</section>".length;

    if (sectionStart === -1 || sectionEnd === -1) {
      console.log("   ⚠️  Could not locate API section boundaries in index.html");
      return;
    }

    const newContent = content.substring(0, sectionStart) + apiSection + content.substring(sectionEnd);

    await writeFile(indexPath, newContent);
    console.log("   ✓ Updated docs/index.html with API reference");
  } catch (error) {
    console.log("   ⚠️  Could not update docs/index.html:", (error as Error).message);
  }
}

/**
 * Generate the API section HTML for index.html
 */
function generateApiSection(allDocs: DocEntry[]): string {
  const packages = [...new Set(allDocs.map((d) => d.package))];

  // Get core package stats
  const goGoScopeCount = allDocs.filter((d) => d.package === "go-go-scope").length;
  const streamCount = allDocs.filter((d) => d.package === "stream").length;
  const schedulerCount = allDocs.filter((d) => d.package === "scheduler").length;
  const testingCount = allDocs.filter((d) => d.package === "testing").length;

  // Get adapter packages
  const adapterPackages = packages
    .filter((p) => p.startsWith("adapter-"))
    .sort()
    .slice(0, 8); // Show first 8

  // Get persistence packages
  const persistencePackages = packages
    .filter((p) => p.startsWith("persistence-"))
    .sort()
    .slice(0, 4);

  // Get plugin packages
  const pluginPackages = packages
    .filter((p) => p.startsWith("plugin-"))
    .sort()
    .slice(0, 4);

  const totalItems = allDocs.length;
  const streamOpCount = allDocs.filter((d) => d.package === "stream" && d.kind === "method").length;
  const adapterCount = packages.filter((p) => p.startsWith("adapter-")).length;

  let html = `<!-- API Reference Section - Links to Auto-Generated Documentation -->

<section id="api" class="content">
    <h2 class="section-anchor">API Reference</h2>
    <p>The complete API documentation is automatically generated from JSDoc comments in the source code, ensuring it's always up-to-date with the latest changes.</p>

    <div style="margin: 32px 0; padding: 24px; background: linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%); border: 3px solid var(--border); box-shadow: var(--shadow);">
        <h3 style="margin-top: 0; color: var(--border);">📚 Auto-Generated API Docs</h3>
        <p style="color: var(--border); margin-bottom: 16px;">Browse the complete API reference organized by package:</p>
        <a href="./api/README.md" style="display: inline-block; padding: 12px 24px; background: var(--border); color: var(--surface); text-decoration: none; font-weight: 700; border: 3px solid var(--border); box-shadow: 4px 4px 0px rgba(0,0,0,0.2);">View Complete API Reference →</a>
    </div>

    <h3>Core Packages</h3>
    <div class="feature-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 24px 0;">
        <div class="feature-card" style="padding: 20px;">
            <div class="feature-title" style="font-size: 16px;">🏃 go-go-scope</div>
            <p class="feature-desc">Core library with Scope, Task, Channel, and concurrency primitives</p>
            <a href="./api/go-go-scope.md" class="code" style="color: var(--primary);">View API (${goGoScopeCount} items) →</a>
        </div>
        <div class="feature-card" style="padding: 20px;">
            <div class="feature-title" style="font-size: 16px;">🌊 @go-go-scope/stream</div>
            <p class="feature-desc">Lazy stream processing with ${streamOpCount}+ operators</p>
            <a href="./api/stream.md" class="code" style="color: var(--primary);">View API (${streamCount} items) →</a>
        </div>
        <div class="feature-card" style="padding: 20px;">
            <div class="feature-title" style="font-size: 16px;">⏰ @go-go-scope/scheduler</div>
            <p class="feature-desc">Distributed job scheduler with cron support</p>
            <a href="./api/scheduler.md" class="code" style="color: var(--primary);">View API (${schedulerCount} items) →</a>
        </div>
        <div class="feature-card" style="padding: 20px;">
            <div class="feature-title" style="font-size: 16px;">🧪 @go-go-scope/testing</div>
            <p class="feature-desc">Testing utilities and mock helpers</p>
            <a href="./api/testing.md" class="code" style="color: var(--primary);">View API (${testingCount} items) →</a>
        </div>
    </div>

    <h3>Framework Adapters</h3>
    <div class="feature-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 24px 0;">`;

  for (const pkg of adapterPackages) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const name = pkg.replace("adapter-", "");
    html += `
        <div class="feature-card" style="padding: 16px;">
            <div class="feature-title" style="font-size: 14px;">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
            <a href="./api/${pkg}.md" class="code" style="color: var(--primary); font-size: 12px;">View (${count} items) →</a>
        </div>`;
  }

  html += `
    </div>

    <h3>Persistence & Plugins</h3>
    <div class="feature-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0;">`;

  for (const pkg of [...persistencePackages, ...pluginPackages]) {
    const count = allDocs.filter((d) => d.package === pkg).length;
    const name = pkg.replace("persistence-", "").replace("plugin-", "");
    html += `
        <div class="feature-card" style="padding: 16px;">
            <div class="feature-title" style="font-size: 14px;">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
            <a href="./api/${pkg}.md" class="code" style="color: var(--primary); font-size: 12px;">View (${count} items) →</a>
        </div>`;
  }

  html += `
    </div>

    <h3>Quick API Stats</h3>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; text-align: center;">
        <div style="padding: 20px; background: var(--surface); border: 2px solid var(--border);">
            <div style="font-size: 32px; font-weight: 700; color: var(--primary);">${totalItems}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Documented Items</div>
        </div>
        <div style="padding: 20px; background: var(--surface); border: 2px solid var(--border);">
            <div style="font-size: 32px; font-weight: 700; color: var(--primary);">${packages.length}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Packages</div>
        </div>
        <div style="padding: 20px; background: var(--surface); border: 2px solid var(--border);">
            <div style="font-size: 32px; font-weight: 700; color: var(--primary);">${streamOpCount}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Stream Operators</div>
        </div>
        <div style="padding: 20px; background: var(--surface); border: 2px solid var(--border);">
            <div style="font-size: 32px; font-weight: 700; color: var(--primary);">${adapterCount}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Framework Adapters</div>
        </div>
    </div>

    <div style="margin: 32px 0; padding: 24px; background: var(--surface); border: 2px solid var(--border); border-radius: 8px;">
        <h4 style="margin-top: 0;">🔍 Searchable API Index</h4>
        <p style="color: var(--text-muted);">A JSON search index is available for building custom search functionality:</p>
        <code style="display: block; padding: 12px; background: var(--code-bg); color: var(--surface); border-radius: 4px; margin-top: 12px;">./api/search-index.json</code>
    </div>

    <div style="margin: 32px 0; padding: 24px; background: var(--surface); border-left: 4px solid var(--primary);">
        <h4 style="margin-top: 0;">📝 Contributing to Documentation</h4>
        <p style="color: var(--text-muted);">When adding new functions, please include comprehensive JSDoc comments with <code>@example</code> blocks. The API docs are automatically generated using:</p>
        <pre style="margin-top: 12px;"><code>pnpm docs:generate</code></pre>
    </div>

    <div style="margin: 40px 0; padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;">
        <p style="margin: 0; color: var(--text-muted);">📚 For detailed guides and examples, see the <a href="./03-api-reference.md" style="color: var(--primary);">API Reference Overview</a> or explore the <a href="https://github.com/thelinuxlich/go-go-scope/tree/main/examples" style="color: var(--primary);" target="_blank">examples directory</a>.</p>
    </div>
</section>

<!-- /API Reference Section -->`;

  return html;
}

/**
 * Main function
 */
async function main() {
  console.log("🔍 Generating API documentation...\n");

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  const allDocs: DocEntry[] = [];

  // Process each package
  const packages = await readdir(PACKAGES_DIR);

  for (const pkg of packages) {
    const pkgPath = join(PACKAGES_DIR, pkg);
    const pkgStat = await stat(pkgPath);

    if (!pkgStat.isDirectory()) continue;

    const srcPath = join(pkgPath, "src");
    try {
      await stat(srcPath);
    } catch {
      continue; // No src directory
    }

    console.log(`📦 Processing ${pkg}...`);

    const tsFiles = await findTsFiles(srcPath);
    const packageDocs: DocEntry[] = [];

    for (const file of tsFiles) {
      const content = await readFile(file, "utf-8");
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      const docs = processSourceFile(relative(process.cwd(), file), sourceFile, pkg);
      packageDocs.push(...docs);
      allDocs.push(...docs);
    }

    if (packageDocs.length > 0) {
      // Generate package-specific markdown
      const markdown = generatePackageMarkdown(packageDocs, pkg);
      const outputPath = join(OUTPUT_DIR, `${pkg}.md`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, markdown);
      console.log(`   ✓ Generated ${outputPath} (${packageDocs.length} documented items)`);
    }
  }

  // Generate search index
  const searchIndex = generateSearchIndex(allDocs);
  await writeFile(join(OUTPUT_DIR, "search-index.json"), searchIndex);

  // Generate main API index
  const mainIndex = generateMainIndex(allDocs);
  await writeFile(join(OUTPUT_DIR, "README.md"), mainIndex);

  // Generate 03-api-reference.md
  const apiRefOverview = generateApiReferenceOverview(allDocs);
  await writeFile(join(DOCS_DIR, "03-api-reference.md"), apiRefOverview);
  console.log(`   ✓ Generated docs/03-api-reference.md`);

  // Update index.html
  await updateIndexHtml(allDocs);

  console.log(`\n✅ Documentation generated in ${OUTPUT_DIR}/`);
  console.log(`   - ${allDocs.length} documented items across ${packages.length} packages`);
  console.log(`   - Search index: search-index.json`);
  console.log(`   - API overview: docs/03-api-reference.md`);
  console.log(`   - Updated: docs/index.html`);
}

main().catch((error) => {
  console.error("Error generating documentation:", error);
  process.exit(1);
});
