export function applyFsDiff(
  currentFiles: Map<string, string>,
  patch: { ops: Array<{ op: string; path: string; content?: string }> }
): Map<string, string> {
  const newFiles = new Map(currentFiles);

  for (const op of patch.ops) {
    if (op.op === 'setFile' && op.content !== undefined) {
      newFiles.set(op.path, op.content);
    } else if (op.op === 'deleteFile') {
      newFiles.delete(op.path);
    }
    // mkdir is implicit in file paths
  }

  return newFiles;
}

