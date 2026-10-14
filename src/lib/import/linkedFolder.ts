import type { ArchiveSource } from "./types";

const SUPPORTED_FOLDER_FILE =
  /\.(?:cbz|zip|epub|cbr|rar|7z|cb7|cbt|tar|tgz|gz|bz2|xz|txt|html|htm|xhtml|md|jpe?g|png|webp|avif|gif|bmp|tiff?)$/i;

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export async function collectLinkedFolderSources(
  directory: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<ArchiveSource[]> {
  const sources: ArchiveSource[] = [];

  for await (const [name, entry] of (
    directory as IterableDirectoryHandle
  ).entries()) {
    const relativePath = parentPath ? `${parentPath}/${name}` : name;
    if (entry.kind === "directory") {
      sources.push(
        ...(await collectLinkedFolderSources(
          entry as FileSystemDirectoryHandle,
          relativePath,
        )),
      );
    } else if (SUPPORTED_FOLDER_FILE.test(name)) {
      sources.push({
        name: relativePath,
        blob: await (entry as FileSystemFileHandle).getFile(),
      });
    }
  }

  return sources;
}
