Your goal is to update any vulnerable dependencies safely.

Steps:

1. Run `npm audit` and summarize the vulnerabilities:
   - Group by severity (low, moderate, high, critical)
   - Identify which packages are causing issues

2. Apply safe fixes:
   - Run `npm audit fix`
   - Do NOT force upgrades that introduce breaking changes

3. For remaining vulnerabilities:
   - Suggest manual fixes (specific package + version)
   - Clearly mark if a fix may introduce breaking changes

4. Verify the project:
   - Run the test suite
   - If tests fail, identify the likely dependency causing the issue

5. Provide a final summary:
   - What was fixed
   - What still needs attention
   - Any risks introduced
   