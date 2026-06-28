import type { CustomTemplateLayout } from "@/app/hooks/useCustomTemplates";

import type { BuiltInPreviewLayout } from "./templatePreviewData";
import styles from "./TemplatePreviewClient.module.css";

function formatLayoutIndex(index: number) {
  return index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
}

function BuiltInPreviewItem({
  index,
  layout,
}: {
  templateSlug: string;
  index: number;
  layout: BuiltInPreviewLayout;
}) {
  const LayoutComponent = layout.component;

  return (
    <article id={layout.layoutId} className={styles.previewItem}>
      <div className={styles.previewHeader}>
        <div className={styles.previewCopy}>
          <span className={styles.previewIndex}>{formatLayoutIndex(index)}</span>
          <div className={styles.previewTitleWrap}>
            <h3 className={styles.previewTitle}>{layout.layoutName}</h3>
            <p className={styles.previewDescription}>{layout.layoutDescription}</p>
          </div>
        </div>
        <span className={styles.previewMeta}>{layout.layoutId}</span>
      </div>
      <div className={styles.previewStageFrame}>
        <div className={styles.previewStageScroller}>
          <div className={styles.previewStageCanvas}>
            <LayoutComponent data={layout.sampleData} />
          </div>
        </div>
      </div>
    </article>
  );
}

function CustomPreviewItem({
  index,
  layout,
}: {
  templateSlug: string;
  index: number;
  layout: CustomTemplateLayout;
}) {
  const LayoutComponent = layout.component;

  return (
    <article id={layout.layoutId} className={styles.previewItem}>
      <div className={styles.previewHeader}>
        <div className={styles.previewCopy}>
          <span className={styles.previewIndex}>{formatLayoutIndex(index)}</span>
          <div className={styles.previewTitleWrap}>
            <h3 className={styles.previewTitle}>{layout.rawLayoutName}</h3>
            <p className={styles.previewDescription}>{layout.layoutDescription}</p>
          </div>
        </div>
        <span className={styles.previewMeta}>{layout.rawLayoutId}</span>
      </div>
      <div className={styles.previewStageFrame}>
        <div className={styles.previewStageScroller}>
          <div className={styles.previewStageCanvas}>
            <LayoutComponent data={layout.sampleData} />
          </div>
        </div>
      </div>
    </article>
  );
}

type TemplatePreviewStackProps = {
  customLayouts: CustomTemplateLayout[];
  isCustom: boolean;
  staticTemplates: BuiltInPreviewLayout[];
  templateSlug: string;
};

export function TemplatePreviewStack({
  customLayouts,
  isCustom,
  staticTemplates,
  templateSlug,
}: TemplatePreviewStackProps) {
  return (
    <div className={styles.previewStack}>
      {!isCustom
        ? staticTemplates.map((layout, index) => (
            <BuiltInPreviewItem
              key={`${templateSlug}-${layout.layoutId}-${index}`}
              templateSlug={templateSlug}
              index={index}
              layout={layout}
            />
          ))
        : customLayouts.map((layout, index) => (
            <CustomPreviewItem
              key={`${templateSlug}-${layout.layoutId}-${index}`}
              templateSlug={templateSlug}
              index={index}
              layout={layout}
            />
          ))}
    </div>
  );
}

