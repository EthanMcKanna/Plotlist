import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

type UploadAvatarArgs = {
  uri: string;
  mimeType?: string | null;
  generateUploadUrl: () => Promise<string>;
};

function parseUploadResponse(body: string) {
  const payload = JSON.parse(body) as { storageId?: unknown; url?: unknown };
  const storageId = typeof payload.storageId === "string" ? payload.storageId : payload.url;
  if (typeof storageId !== "string" || storageId.length === 0) {
    throw new Error("Upload response did not include a profile image URL");
  }
  return storageId;
}

async function uploadWithFetch(uploadUrl: string, uri: string, contentType: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: blob,
  });

  const body = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed with ${uploadResponse.status}: ${body}`);
  }

  return parseUploadResponse(body);
}

async function uploadWithFileSystem(uploadUrl: string, uri: string, contentType: string) {
  const uploadResponse = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw new Error(`Upload failed with ${uploadResponse.status}: ${uploadResponse.body}`);
  }

  return parseUploadResponse(uploadResponse.body);
}

export async function uploadAvatarImage({
  uri,
  mimeType,
  generateUploadUrl,
}: UploadAvatarArgs) {
  const uploadUrl = await generateUploadUrl();
  const contentType = mimeType ?? "image/jpeg";

  if (Platform.OS === "web") {
    return await uploadWithFetch(uploadUrl, uri, contentType);
  }

  return await uploadWithFileSystem(uploadUrl, uri, contentType);
}
