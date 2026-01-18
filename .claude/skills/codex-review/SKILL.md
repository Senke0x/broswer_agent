---
name: codex-review
description: Automated code review using Codex CLI with intelligent fallback to project skills. Analyzes commits for architecture issues, code quality, performance, security, and best practices. Use when reviewing code changes, commits, or pull requests.
license: MIT
metadata:
  author: project
  version: "1.0.0"
  requires:
    - codex CLI (optional, falls back to skills)
    - vercel-react-best-practices skill
    - web-design-guidelines skill
---

# Codex Review Skill

## When to Apply

Use this skill when:
- User asks to review code, commits, or pull requests
- User mentions "review", "check code quality", "analyze changes"
- Before merging significant changes
- After implementing new features or fixes
- When conducting code audits

## Review Strategy

This skill uses a **two-tier approach**:

1. **Primary**: Codex CLI automated review
   - Fast, comprehensive analysis
   - Structured output with priority levels
   - Detects patterns across multiple categories

2. **Fallback**: Project skills review
   - Activates if Codex fails or is unavailable
   - Uses vercel-react-best-practices for React/Next.js code
   - Uses web-design-guidelines for UI/UX code
   - Manual analysis with structured reporting

## Review Categories by Priority

### CRITICAL (P0)
Issues that break functionality or create security vulnerabilities:
- Security vulnerabilities (XSS, SQL injection, auth bypass)
- Data loss or corruption risks
- Breaking API changes without migration
- Critical performance regressions
- Unhandled error states causing crashes

### HIGH (P1)
Issues that significantly impact quality or maintainability:
- Incorrect business logic implementation
- Missing error handling for external APIs
- Performance bottlenecks (N+1 queries, unnecessary re-renders)
- Accessibility violations (WCAG AA failures)
- Incorrect file placement or symlink structure
- Missing required configuration

### MEDIUM (P2)
Issues that affect code quality or user experience:
- Code duplication or poor abstraction
- Inconsistent patterns or conventions
- Missing TypeScript types or weak typing
- Suboptimal React patterns (missing memoization, incorrect hooks)
- UI/UX inconsistencies
- Missing or inadequate tests

### LOW (P3)
Minor improvements and optimizations:
- Code style inconsistencies
- Missing comments for complex logic
- Opportunities for refactoring
- Documentation gaps
- Minor performance optimizations

## Workflow

### Step 1: Determine Review Scope

Identify what needs to be reviewed:
- **Single commit**: Use `--commit HEAD` or specific commit hash
- **Commit range**: Use `--commit <hash1>..<hash2>`
- **Uncommitted changes**: Use without commit flag
- **Pull request**: Get PR number and review all commits

### Step 2: Attempt Codex Review

Run the Codex CLI review command:

```bash
# Review latest commit
echo "" | codex review --commit HEAD

# Review specific commit
echo "" | codex review --commit <hash>

# Review uncommitted changes
echo "" | codex review
```

**Important**: Use `echo "" |` prefix to handle interactive prompts non-interactively.

### Step 3: Parse Codex Output

If Codex succeeds, extract:
- Priority levels (P0, P1, P2, P3)
- Issue descriptions
- File paths and line numbers
- Suggested fixes

Format output as structured review comments.

### Step 4: Fallback to Project Skills (If Codex Fails)

If Codex CLI is unavailable or fails, use project skills:

**For React/Next.js code:**
1. Read the vercel-react-best-practices skill
2. Apply relevant rules from these categories:
   - Server Components & Data Fetching
   - Client Components & Interactivity
   - Performance & Bundle Optimization
   - Async Patterns & Error Handling
3. Check for violations and report with priority levels

**For UI/UX code:**
1. Read the web-design-guidelines skill
2. Check for accessibility violations
3. Verify responsive design patterns
4. Validate user interaction patterns

**Manual review checklist:**
- [ ] Security: Check for XSS, injection, auth issues
- [ ] Architecture: Verify file structure, imports, dependencies
- [ ] Performance: Check for unnecessary re-renders, large bundles
- [ ] Error handling: Verify try-catch, error boundaries
- [ ] TypeScript: Check type safety, avoid `any`
- [ ] Testing: Verify test coverage for critical paths

### Step 5: Format and Report Results

Present review findings in this structure:

```markdown
## Code Review Summary

**Review Method**: [Codex CLI | Manual with Skills]
**Scope**: [commit hash | file paths]
**Issues Found**: [count by priority]

### Critical Issues (P0)
- [P0] Issue description — file_path:line_number
  Explanation and suggested fix

### High Priority Issues (P1)
- [P1] Issue description — file_path:line_number
  Explanation and suggested fix

### Medium Priority Issues (P2)
- [P2] Issue description — file_path:line_number
  Explanation and suggested fix

### Low Priority Issues (P3)
- [P3] Issue description — file_path:line_number
  Explanation and suggested fix

### Recommendations
- Overall code quality assessment
- Suggested next steps
- Areas requiring attention
```

## Quick Reference

### Common Review Scenarios

| Scenario | Command | Fallback |
|----------|---------|----------|
| Review latest commit | `echo "" \| codex review --commit HEAD` | Manual + vercel-react-best-practices |
| Review PR changes | `echo "" \| codex review --commit <base>..<head>` | Manual + all skills |
| Review uncommitted | `echo "" \| codex review` | Manual + all skills |
| Review specific file | Read file + apply skills | vercel-react-best-practices or web-design-guidelines |

### Priority Guidelines

- **P0 (CRITICAL)**: Must fix before merge
- **P1 (HIGH)**: Should fix before merge
- **P2 (MEDIUM)**: Fix in follow-up PR
- **P3 (LOW)**: Optional improvements

## Error Handling

### Codex CLI Failures

If Codex CLI fails, check for:
1. **Command not found**: Codex not installed or not in PATH
   - Fallback: Use manual review with project skills
2. **Authentication errors**: Invalid or expired credentials
   - Fallback: Use manual review with project skills
3. **Network errors**: Cannot reach Codex server
   - Fallback: Use manual review with project skills
4. **Parsing errors**: Cannot parse git output
   - Verify git repository state and retry

### Skill Fallback Failures

If project skills are unavailable:
1. Check skill paths in AGENTS.md
2. Verify symlinks are correct
3. Perform basic manual review focusing on:
   - Security vulnerabilities
   - Breaking changes
   - TypeScript errors
   - Obvious bugs

## Examples

### Example 1: Review Latest Commit with Codex

```bash
# Run Codex review
echo "" | codex review --commit HEAD

# Expected output format:
# - [P1] Gemini skill symlinks stored under wrong directory — .codex/skills/.gemini/skills/...:1
#   Explanation: Symlinks should be in .gemini/skills not .codex/skills/.gemini/skills
```

### Example 2: Fallback to Manual Review

If Codex fails, perform manual review:

1. Read changed files with git diff
2. Apply vercel-react-best-practices rules
3. Check for common issues:
   - Server/Client component boundaries
   - Async/await patterns
   - Bundle optimization opportunities
4. Format findings with priority levels

## Notes

### Best Practices

1. **Always try Codex first**: It's faster and more comprehensive
2. **Use non-interactive mode**: Prefix commands with `echo "" |`
3. **Review before merge**: Catch issues early in the development cycle
4. **Prioritize fixes**: Focus on P0/P1 issues first
5. **Document decisions**: If ignoring an issue, explain why

### Integration with Project

This skill integrates with:
- **vercel-react-best-practices**: For React/Next.js specific patterns
- **web-design-guidelines**: For UI/UX and accessibility checks
- **Git workflow**: Reviews commits before push/merge
- **AGENTS.md**: Documented as project skill

### Maintenance

- Keep Codex CLI updated for latest rules
- Sync with project skills when they're updated
- Add project-specific rules as needed
- Review and update priority classifications periodically

---

**Last Updated**: 2026-01-18
**Version**: 1.0.0
