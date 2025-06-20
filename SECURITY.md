# Security Policy

I take the security of my personal website seriously. I appreciate any and all efforts from the security community to help me keep it safe for everyone.

## Scope

This security policy applies to the code and dependencies of the `vicsanity623.github.io` website, hosted via GitHub Pages. As this is a static website, the only "supported version" is the latest commit on the `main` branch.

Potential vulnerabilities should be related to client-side security.

| In-Scope Vulnerabilities | Examples |
| ------------------------ | ------------------ |
| :white_check_mark: Client-Side Code | Cross-Site Scripting (XSS), insecure handling of URI fragments, etc. |
| :white_check_mark: Dependencies | Vulnerabilities in third-party JavaScript libraries being used. |
| :white_check_mark: Content Injection | For example, if content from a URL parameter is rendered unsafely on the page. |

| Out-of-Scope Vulnerabilities | Reason |
| ---------------------------- | ------------------ |
| :x: Server-Side Vulnerabilities | This is a static site with no server-side code (e.g., no PHP, Node.js, Python). |
| :x: Database Vulnerabilities | There is no database connected to this site (e.g., no SQL Injection). |
| :x: Login or Authentication Issues | There are no user accounts or authentication systems. |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it to me privately. **Please do not disclose the vulnerability publicly until it has been addressed.**

### Preferred Method: Private Vulnerability Report

The best way to report a vulnerability is by using GitHub's private vulnerability reporting feature.

**[Click here to submit a private report](https://github.com/vicsanity623/vicsanity623.github.io/security/advisories/new)**

This method ensures the report is delivered directly and securely.

### What to Expect

When you report a vulnerability, you can expect the following:

1.  **Acknowledgement**: I will aim to acknowledge receipt of your report within **48-72 hours**.
2.  **Investigation**: I will investigate the report and confirm the vulnerability. I will keep you updated on my progress.
3.  **Resolution**: If the vulnerability is confirmed, I will work to fix it by pushing a new commit to the `main` branch. Since this is a personal project, a fix will be deployed as soon as it's ready.
4.  **Credit**: After the vulnerability is fixed, I would be happy to give you public credit for your discovery if you wish. Please let me know if you would like to be credited and how you would like your name to appear.

Thank you for helping keep my project safe!
