import React from "react";

import type { CustomTemplateToolbarConfig } from "../customTemplatePageConfig";
import styles from "../customTemplateWorkbench.module.css";

type CustomTemplateShellToolbarProps = {
  toolbar: CustomTemplateToolbarConfig;
};

export function CustomTemplateShellToolbar({
  toolbar,
}: CustomTemplateShellToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarTitle}>
        <span className={styles.toolbarEyebrow}>{toolbar.eyebrow}</span>
        <strong>{toolbar.title}</strong>
        <span>{toolbar.description}</span>
      </div>
      <div className={styles.toolbarActions}>
        {toolbar.meta ? <span className={styles.toolbarMeta}>{toolbar.meta}</span> : null}
        {toolbar.actionLabel && toolbar.onAction ? (
          <button
            type="button"
            className={styles.headerAction}
            onClick={toolbar.onAction}
            disabled={toolbar.actionDisabled || toolbar.actionLoading}
          >
            {toolbar.actionIcon}
            {toolbar.actionLoading ? "Working..." : toolbar.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
