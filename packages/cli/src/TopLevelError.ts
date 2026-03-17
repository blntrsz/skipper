export const toTopLevelErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "Unknown error";
};
