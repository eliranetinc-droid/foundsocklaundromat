export type TicketInput = {
  subdomain: string;
  apiKey: string;
  name: string;
  email: string;
  subject: string;
  description: string;
  type: 'issue' | 'general';
};

export async function submitFreshdeskTicket(input: TicketInput): Promise<{ id: number }> {
  const auth = btoa(`${input.apiKey}:X`);
  const body = {
    name: input.name,
    email: input.email,
    subject: input.subject,
    description: input.description.replace(/\n/g, '<br>'),
    priority: input.type === 'issue' ? 2 : 1,
    status: 2, // open
    type: input.type === 'issue' ? 'Incident' : 'Question',
  };

  const res = await fetch(`https://${input.subdomain}.freshdesk.com/api/v2/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Freshdesk error ${res.status}: ${text}`);
  }
  const data = await res.json() as { id: number };
  return { id: data.id };
}

export type IssueTicketInput = {
  subdomain: string;
  apiKey: string;
  name: string;
  email: string;
  subject: string;
  description: string;            // already-formatted HTML
  attachment?: { filename: string; type: string; data: ArrayBuffer } | null;
};

export async function submitFreshdeskIssueTicket(input: IssueTicketInput): Promise<{ id: number }> {
  const auth = btoa(`${input.apiKey}:X`);
  const fd = new FormData();
  fd.set('name', input.name);
  fd.set('email', input.email);
  fd.set('subject', input.subject);
  fd.set('description', input.description);
  fd.set('priority', '2');
  fd.set('status', '2');
  fd.set('type', 'Incident');
  if (input.attachment) {
    fd.set('attachments[]', new Blob([input.attachment.data], { type: input.attachment.type }), input.attachment.filename);
  }

  const res = await fetch(`https://${input.subdomain}.freshdesk.com/api/v2/tickets`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Freshdesk error ${res.status}: ${text}`);
  }
  const data = await res.json() as { id: number };
  return { id: data.id };
}
