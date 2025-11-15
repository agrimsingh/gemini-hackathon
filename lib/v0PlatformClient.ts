import { createClient } from 'v0-sdk';

const V0_API_KEY = process.env.V0_API_KEY;

if (!V0_API_KEY) {
  throw new Error(
    'V0_API_KEY is required in the environment to call the v0 Platform API.'
  );
}

const v0 = createClient({ apiKey: V0_API_KEY });

type V0DeploymentMeta = {
  previewUrl?: string;
  preview_url?: string;
  url?: string;
  id?: string;
};

const unwrapDeploymentRecord = (record: any): V0DeploymentMeta | null => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if ('deployment' in record && record.deployment) {
    return unwrapDeploymentRecord(record.deployment);
  }

  if ('data' in record && record.data) {
    return unwrapDeploymentRecord(record.data);
  }

  return record as V0DeploymentMeta;
};

const getPreviewUrl = (record?: V0DeploymentMeta | null) => {
  const normalized = unwrapDeploymentRecord(record);
  return (
    normalized?.previewUrl ?? normalized?.preview_url ?? normalized?.url ?? null
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type V0PlatformProjectContext = {
  projectId: string;
  chatId: string;
  versionId?: string | null;
  deploymentId?: string | null;
  previewUrl?: string | null;
};

export type ApplyPromptOptions = {
  chatId?: string;
  files?: Array<{ name: string; content: string }>;
  context?: string;
};

export class V0PlatformClient {
  async createProjectForRoom(roomId: string): Promise<V0PlatformProjectContext> {
    const project = await v0.projects.create({
      name: `vibe-room-${roomId}`,
      description: `Collaborative project for room ${roomId}`,
    });

    const chatId = await this.initializeChat(project.id, roomId);

    return {
      projectId: project.id,
      chatId,
    };
  }

  async applyPromptToProject(
    projectId: string,
    prompt: string,
    options: ApplyPromptOptions = {}
  ): Promise<V0PlatformProjectContext> {
    const chatId =
      options.chatId ?? (await this.initializeChat(projectId, options.context));

    const response = await v0.chats.sendMessage({
      chatId,
      message: prompt,
    });

    const versionId =
      (response as any).latestVersion?.id ?? (response as any).version?.id ?? null;

    // v0 SDK returns chat.demo as the preview URL
    const previewUrl = (response as any).demo ?? getPreviewUrl((response as any).latestVersion) ?? getPreviewUrl((response as any).version);

    // Create deployment but don't wait for it
    const deployment = await v0.deployments.create({
      projectId,
      chatId,
      versionId: versionId || undefined,
    });

    return {
      projectId,
      chatId,
      versionId,
      deploymentId: deployment.id,
      previewUrl,
    };
  }

  async downloadVersionFiles(
    chatId: string,
    versionId: string
  ): Promise<ArrayBuffer> {
    const result = await v0.chats.downloadVersion({
      chatId,
      versionId,
      format: 'zip',
      includeDefaultFiles: true,
    });

    return result as ArrayBuffer;
  }

  private async initializeChat(
    projectId: string,
    roomContext?: string
  ): Promise<string> {
    const chat = await v0.chats.create({
      projectId,
      message: roomContext
        ? `New room ${roomContext} is controlling this project.`
        : 'New room is controlling this project.',
      system: roomContext
        ? `This project powers room ${roomContext} inside Vibe de Deux.`
        : 'This project is controlled by Vibe de Deux.',
    });

    return (chat as any).id;
  }
}

export const v0PlatformClient = new V0PlatformClient();

