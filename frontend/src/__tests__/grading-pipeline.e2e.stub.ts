/**
 * E2E test stubs for the grading pipeline.
 *
 * These stubs document the critical user journeys that should be covered.
 * Implement with Playwright or Cypress depending on project preference.
 *
 * Run:  npx playwright test  (after configuring playwright.config.js)
 */

// ─── Test 1: Student uploads → teacher can see in mailbox ────────────

describe('Student submission → teacher visibility', () => {
    it.todo('Student logs in, selects a course, uploads a PDF, and confirms submission');
    it.todo('Teacher logs in, navigates to mailbox, sees the new submission under the correct assignment');
    it.todo('Teacher clicks "Grade Now" and lands on GradeWorkbench with correct PDF loaded');
});

// ─── Test 2: Teacher grades & finalizes → student sees result ────────

describe('Teacher grading → student result', () => {
    it.todo('Teacher opens GradeWorkbench, adds an annotation, and clicks "Finalize Save To PDF"');
    it.todo('Teacher switches to Grader tab, fills rubric scores, and saves');
    it.todo('Submission status changes from "Needs Grading" to "Graded" in mailbox');
    it.todo('Student logs in, navigates to assignments, sees grade and "View Feedback" button');
});
