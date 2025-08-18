
import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";
import {Readable} from "stream";

// The admin app is initialized in index.ts,
// so no need to initialize it here.

export const uploadImage = onCall(async (request: CallableRequest<{
  imageData: string,
  fileName: string
}>) => {
  if (!request.auth) {
    throw new Error("Authentication required.");
  }

  const {imageData, fileName} = request.data;
  const uid = request.auth.uid;
  const bucket = getStorage().bucket();

  // Create a buffer from the base64 string
  const buffer = Buffer.from(imageData, "base64");

  // Define the path in GCS
  const filePath = `user-uploads/${uid}/images/${fileName}`;
  const file = bucket.file(filePath);

  // Create a readable stream from the buffer
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return new Promise((resolve, reject) => {
    stream.pipe(file.createWriteStream())
        .on("error", (error: Error) => {
          reject(new Error(`File upload failed: ${error.message}`));
        })
        .on("finish", async () => {
        // Make the file public for simplicity,
        // or generate a signed URL for private access
          await file.makePublic();
          resolve({fileUrl: file.publicUrl()});
        });
  });
});
