# Testing Contract (Playwright)

For any page that has Playwright coverage:

1. Add a stable page hook:
   - Outer wrapper gets: data-testid="<page>-page"

2. Add a stable "ready" hook:
   - An element that only appears when the page's data is loaded gets:
     data-testid="<page>-ready"
   - OR use an existing stable element like "session-summary".

3. Avoid duplicate test ids on the same page.

4. In Playwright tests:
   - Wait for the ready hook before asserting other UI.
   - Prefer getByTestId(...) over getByText(...) for structure/copy.
