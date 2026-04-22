try {
  process.loadEnvFile?.();
} catch (error) {
  const isMissingEnvFileError =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";

  if (!isMissingEnvFileError) {
    throw error;
  }
}

await import("./index.js");
