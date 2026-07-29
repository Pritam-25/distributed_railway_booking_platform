export type EndpointDoc = {
  summary: string;
  description: string;
};

export const bulletList = (items: string[]): string =>
  items.map((item) => `- ${item}`).join("\n");

export const joinSections = (...sections: Array<string | undefined>): string =>
  sections
    .filter((section) => section && section.trim().length > 0)
    .join("\n\n");

export const buildEndpointDoc = (input: {
  summary: string;
  overview: string;
  requestBodyFields?: string[];
  response: string;
  outcomes: string[];
  notes?: string[];
}): EndpointDoc => ({
  summary: input.summary,
  description: joinSections(
    input.overview,
    input.requestBodyFields && input.requestBodyFields.length > 0
      ? `**Request Body Fields:**\n${bulletList(input.requestBodyFields)}`
      : undefined,
    `**Response:**\n${input.response}`,
    `**Outcomes:**\n${bulletList(input.outcomes)}`,
    input.notes && input.notes.length > 0
      ? `**Notes:**\n${bulletList(input.notes)}`
      : undefined,
  ),
});
