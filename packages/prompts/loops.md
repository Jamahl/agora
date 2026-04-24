Add capabilities to your agent
Skills are composable modules that teach your coding agent how to work with Loops. Install them with a single command.

Skills

Alpha

GitHub
View docs
CLI repo
API
Contacts CRUD, custom properties, mailing lists, events, transactional emails, SDK patterns, rate limits, and idempotency keys.

npx skills add loops-so/skills -g -s api


Covers contacts, events, transactional email, mailing lists, SDK vs REST API patterns, rate limits, idempotency keys, and error handling.

CLI
Install and authenticate the Loops CLI, manage team keys, and run contact, list, event, and transactional email commands.

npx skills add loops-so/skills -g -s cli


Install, authenticate, and manage contacts, events, mailing lists, and transactional emails from the terminal. Supports multi-team auth and JSON output for scripting.

Email best practices
Works without Loops

General-purpose email skill. Audits deliverability, structure, and lifecycle patterns. Works with or without Loops.

npx skills add loops-so/skills -g -s email-sending-best-practices


Validates sender authentication (SPF, DKIM, DMARC), checks transactional vs. marketing separation, reviews unsubscribe handling, flags missing lifecycle stages, and scores content for spam triggers.


use: 

- https://loops.so/docs
and 
- https://github.com/Loops-so/cli