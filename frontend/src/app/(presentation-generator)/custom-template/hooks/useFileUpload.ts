import { useState, useCallback } from "react";
import { notify } from "@/components/ui/sonner";

export const useFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateAndStoreFile = useCallback((file: File | null | undefined) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isPptx = lowerName.endsWith(".pptx");
    if (!isPptx) {
      notify.error("Invalid file", "Please select a valid PPTX file.");
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      notify.error("File too large", "File size must be less than 100MB.");
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      validateAndStoreFile(event.target.files?.[0]);
    },
    [validateAndStoreFile]
  );

  const removeFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    validateAndStoreFile(event.dataTransfer.files?.[0]);
  }, [validateAndStoreFile]);

  return {
    selectedFile,
    isDragging,
    handleFileSelect,
    removeFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}; 
