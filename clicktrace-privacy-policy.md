# ClickTrace Network Inspector — Privacy Policy

**Last updated:** October 9, 2026

## 1. Introduction

ClickTrace Network Inspector is a Microsoft Edge extension designed to help developers inspect network requests associated with interactions on webpages. This policy explains what information the extension accesses, how it is used, and how users control their captured data.

## 2. Information Accessed

When a user explicitly starts recording, ClickTrace may access and process the following information from the selected browser tab:

- **Network information:** Request URLs, HTTP methods, status codes, request and response headers, request bodies when exposed by the browser, resource types, timing information, and request initiators.
- **Browsing information:** The URL and title of the webpage being inspected.
- **Interaction information:** Details about clicked webpage elements, including their visible text, HTML tag, element ID, and CSS classes.
- **Technical information:** Network errors and other request metadata exposed through the browser's debugging interface.

Network requests may contain personal information, authentication tokens, or other sensitive data.

## 3. How Information Is Used

Information is accessed solely to provide the extension's network inspection and debugging features. ClickTrace associates network requests occurring shortly after a recorded click with that interaction to help users investigate webpage behavior.

This association is based on timing and does not necessarily prove that a click caused a particular request.

## 4. Storage and Sharing

Captured information is maintained locally in the extension's runtime memory and can be exported by the user as a JSON file. The extension does not intentionally transmit captured information to a developer-controlled server or sell user data.

Exported files are saved through the browser's normal download mechanism. Users are responsible for protecting exported files and deciding whether to share them.

## 5. User Control and Data Deletion

Recording is initiated by the user and can be stopped at any time. Users can clear their captures through the extension interface. Captures retained in memory are subject to the extension's runtime lifecycle. Exported JSON files must be deleted separately by the user.

Users should avoid recording or sharing requests containing information they do not wish to disclose.

## 6. Permissions

ClickTrace uses the browser debugging permission to inspect network activity, the side panel permission to display its dashboard, and webpage access to detect user interactions on supported webpages.

These capabilities are used to provide the extension's stated debugging purpose.

## 7. Children's Privacy

ClickTrace is a developer tool and is not specifically designed to collect information from children.

## 8. Changes to This Policy

This policy will be updated if the extension's data practices or functionality change. The latest version will be made available at the public URL associated with the extension.

## 9. Contact

**Publisher:** dev-maegor

**Contact:** botriskyff@gmail.com
