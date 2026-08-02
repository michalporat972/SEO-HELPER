# SEO Content Optimizer

A Claude skill that takes a draft blog post or article and optimizes it for search — keyword research, authoritative link insertion, heading structure, meta tags — while preserving the author's voice.

## What it does

Hand it any draft. It will:

1. **Research real keywords** — runs 3-5 web searches to find primary, secondary, and long-tail keywords people actually search for
2. **Find and insert authoritative links** — searches for data, studies, and reputable sources, then weaves them into the text as natural anchor text
3. **Optimize structure** — fixes heading hierarchy, adds H2s for content gaps, ensures keywords land in the right places (title, first 100 words, headings, conclusion)
4. **Write meta tags** — generates a meta description, suggests a URL slug
5. **Document everything** — delivers an SEO summary card and a change log so you can see exactly what changed and why

## What it doesn't do

- Rewrite your voice into generic SEO copy
- Stuff keywords where they don't belong
- Add links for the sake of link count
- Run technical site audits (use a dedicated SEO audit tool for that)

## How to use it

### In Claude

Install the `.skill` file or drop the `SKILL.md` into your skills directory. Then:

- Paste your draft and say **"optimize for SEO"**
- Or: **"SEO this"**, **"add keywords and links"**, **"make this rank"**

The skill will ask you to confirm the target keyword and output format (inline or file), then run the full workflow.

### Standalone

The `SKILL.md` is plain markdown with YAML frontmatter. You can read it as a reference for manual SEO optimization, or adapt it for other AI tools that accept system-level instructions.

## Supported content types

- Blog posts and articles (primary use case)
- Thought leadership and opinion pieces (lighter touch — preserves editorial voice)
- Hebrew content (searches in both Hebrew and English, uses Israeli and international sources)
- Technical content (keeps jargon intact — the audience searches for those exact terms)

## Output format

Every optimization includes three parts:

1. **SEO Summary Card** — primary keyword, secondary keywords, meta description, URL slug, link count, key changes
2. **Optimized text** — with links embedded and inline comments marking significant changes
3. **Change log** — what was added, restructured, left untouched, and what the author should consider

## Example

**Input:** A 600-word article about AI in food trend forecasting, no links, no meta tags, flat heading structure.

**Output:** Same article with primary keyword in the title and first paragraph, 5 authoritative external links, H2 sections, a new FAQ section targeting question-based searches, meta description, and URL slug suggestion. Original voice intact.

## File structure

```
seo-content-optimizer/
└── SKILL.md
```

## License

MIT
