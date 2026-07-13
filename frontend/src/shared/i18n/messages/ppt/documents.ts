import type { MessageDictionary } from "../types";

export const enPptDocumentsMessages = {
  "ppt_generator.documents.banner.subtitle": "Check the extracted text before PPT Generator turns it into an outline.",
  "ppt_generator.documents.banner.title": "Review extracted documents",
  "ppt_generator.documents.closePanel": "Close panel",
  "ppt_generator.documents.content": "Content:",
  "ppt_generator.documents.empty.body": "This file did not yield previewable text yet. You can continue, or upload a cleaner source file.",
  "ppt_generator.documents.empty.title": "No extracted text",
  "ppt_generator.documents.error.body": "We could not read the extracted text for this file.",
  "ppt_generator.documents.error.create": "Error in presentation creation.",
  "ppt_generator.documents.error.title": "Could not load this document",
  "ppt_generator.documents.library.body": "Switch between uploaded sources and confirm the extracted text looks usable.",
  "ppt_generator.documents.library.title": "Source files",
  "ppt_generator.documents.loading": "Generating presentation outline...",
  "ppt_generator.documents.missing.body": "Return to the upload step and add at least one source file to continue.",
  "ppt_generator.documents.missing.cta": "Back to upload",
  "ppt_generator.documents.missing.title": "No documents loaded",
  "ppt_generator.documents.next": "Next",
  "ppt_generator.documents.notify.createFailed.body": "Something went wrong while creating the presentation.",
  "ppt_generator.documents.notify.createFailed.title": "Creation failed",
  "ppt_generator.documents.notify.readFailed.body": "Failed to read document content.",
  "ppt_generator.documents.notify.readFailed.title": "Could not read document",
  "ppt_generator.documents.openPanel": "Open Panel",
  "ppt_generator.documents.retry": "Retry",
  "ppt_generator.documents.section.documents": "Documents",
  "ppt_generator.documents.state.empty": "No text",
  "ppt_generator.documents.state.error": "Needs retry",
  "ppt_generator.documents.state.loading": "Loading",
  "ppt_generator.documents.state.missing": "No document selected",
  "ppt_generator.documents.state.ready": "Ready",
  "ppt_generator.documents.summary.badge": "Preview status",
  "ppt_generator.documents.summary.body": "A quick pass here helps catch empty extracts or broken parsing before PPT Generator builds the outline.",
  "ppt_generator.documents.summary.characters": "Characters",
  "ppt_generator.documents.summary.documents": "Documents",
  "ppt_generator.documents.summary.selected": "Selected",
  "ppt_generator.documents.summary.state": "State",
  "ppt_generator.documents.summary.title": "Keep the source clean before outline generation.",
  "ppt_generator.documents.viewer.subtitle": "This preview keeps the cleaned text in view so you can catch empty or messy extraction before the outline step.",
} as const satisfies MessageDictionary;


export const zhCNPptDocumentsMessages = {

} as const satisfies MessageDictionary;


export const zhHKPptDocumentsMessages = {

} as const satisfies MessageDictionary;
