import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash } from "lucide-react";
import { marked } from "marked";
import ToolTip from "@/components/ToolTip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import styles from "./OutlineWorkspace.module.css";

interface OutlineItemProps {
  sortableId: string;
  slideOutline: {
    content: string;
  };
  index: number;
  isStreaming: boolean;
  isActiveStreaming?: boolean;
  isStableStreaming?: boolean;
  enableSorting?: boolean;
  onChange: (index: number, content: string) => void;
  onDelete: (index: number) => void;
}

interface OutlineItemCardProps {
  index: number;
  slideOutline: {
    content: string;
  };
  isStreaming: boolean;
  isActiveStreaming: boolean;
  isStableStreaming: boolean;
  isDragging?: boolean;
  sortableHandleProps?: HTMLAttributes<HTMLDivElement>;
  enableSorting: boolean;
  onChange: (index: number, content: string) => void;
  onDelete: (index: number) => void;
}

function OutlineItemCard({
  index,
  slideOutline,
  isStreaming,
  isActiveStreaming,
  isStableStreaming,
  isDragging = false,
  sortableHandleProps,
  enableSorting,
  onChange,
  onDelete,
}: OutlineItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const content = slideOutline.content || "";
  const showStreamingText = isStreaming && isActiveStreaming;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    if (!isEditing) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    const cursorPosition = textarea.value.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
    resizeTextarea();
  }, [isEditing, resizeTextarea]);

  useEffect(() => {
    if (!isEditing) return;
    resizeTextarea();
  }, [content, isEditing, resizeTextarea]);

  const renderedHtml = useMemo(() => {
    if (showStreamingText) {
      return null;
    }

    if (isStreaming && !isStableStreaming) {
      return null;
    }

    try {
      return marked.parse(content) as string;
    } catch {
      return "";
    }
  }, [content, isStableStreaming, isStreaming, showStreamingText]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(index - 1, event.target.value);
    resizeTextarea();
  };

  const handleSlideDelete = () => {
    if (isStreaming) return;
    onDelete(index - 1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsEditing(true);
    }
  };

  return (
    <div
      id={`outline-item-${index}`}
      data-outline-item-index={index - 1}
      className={cn(
        styles.itemCard,
        !showStreamingText && !isEditing && styles.itemCardReady,
        showStreamingText && styles.itemCardActive,
        isEditing && styles.itemCardEditing,
        isDragging && styles.itemCardDragging
      )}
    >
      {showStreamingText ? <div className={styles.itemProgressLine} aria-hidden="true" /> : null}

      <div className={styles.itemHeader}>
        <div className={styles.itemHeaderLeft}>
          <div
            {...sortableHandleProps}
            className={cn(
              styles.itemHandle,
              enableSorting && !isStreaming
                ? styles.itemHandleSortable
                : styles.itemHandleStatic
            )}
            aria-label={enableSorting && !isStreaming ? `Drag slide ${index}` : undefined}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </div>

          <div className={styles.itemMeta}>
            <div className={styles.itemPillRow}>
              <span className={styles.itemPill}>Slide {index}</span>
              <span
                className={cn(
                  styles.itemStatus,
                  !showStreamingText && styles.itemStatusReady
                )}
              >
                {showStreamingText ? "Generating" : isEditing ? "Editing" : "Ready"}
              </span>
            </div>
          </div>
        </div>

        {!isStreaming ? (
          <ToolTip content="Delete Slide">
            <button
              type="button"
              onClick={handleSlideDelete}
              className={styles.itemDeleteButton}
            >
              <Trash className="h-4 w-4" aria-hidden="true" />
            </button>
          </ToolTip>
        ) : null}
      </div>

      <div className={styles.itemBody}>
        {showStreamingText ? (
          <>
            <div className={cn(styles.itemStreamingBody, styles.itemStreamingBodyActive)}>
              {content}
              <span className={styles.streamCaret} aria-hidden="true" />
            </div>
            <div className={styles.streamNote}>Generating this slide</div>
          </>
        ) : isEditing ? (
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onBlur={() => setIsEditing(false)}
            placeholder="Enter markdown content here..."
            className={styles.itemTextarea}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Edit slide ${index} markdown`}
            onClick={() => setIsEditing(true)}
            onFocus={() => setIsEditing(true)}
            onKeyDown={handleKeyDown}
            className={styles.markdownButton}
          >
            {renderedHtml ? (
              <div
                className={styles.markdownBody}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : content.trim() ? (
              <div className={styles.itemStreamingBody}>{content}</div>
            ) : (
              <p className={styles.emptyText}>Empty outline</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableOutlineItem(props: OutlineItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.sortableId });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition]
  );

  return (
    <div ref={setNodeRef} style={style}>
      <OutlineItemCard
        index={props.index}
        slideOutline={props.slideOutline}
        isStreaming={props.isStreaming}
        isActiveStreaming={props.isActiveStreaming ?? false}
        isStableStreaming={props.isStableStreaming ?? false}
        isDragging={isDragging}
        sortableHandleProps={{ ...attributes, ...listeners }}
        enableSorting={true}
        onChange={props.onChange}
        onDelete={props.onDelete}
      />
    </div>
  );
}

function OutlineItemComponent(props: OutlineItemProps) {
  if (!props.enableSorting || props.isStreaming) {
    return (
      <OutlineItemCard
        index={props.index}
        slideOutline={props.slideOutline}
        isStreaming={props.isStreaming}
        isActiveStreaming={props.isActiveStreaming ?? false}
        isStableStreaming={props.isStableStreaming ?? false}
        enableSorting={Boolean(props.enableSorting)}
        onChange={props.onChange}
        onDelete={props.onDelete}
      />
    );
  }

  return <SortableOutlineItem {...props} />;
}

export const OutlineItem = memo(
  OutlineItemComponent,
  (prevProps, nextProps) =>
    prevProps.sortableId === nextProps.sortableId &&
    prevProps.slideOutline.content === nextProps.slideOutline.content &&
    prevProps.index === nextProps.index &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.isActiveStreaming === nextProps.isActiveStreaming &&
    prevProps.isStableStreaming === nextProps.isStableStreaming &&
    prevProps.enableSorting === nextProps.enableSorting
);
