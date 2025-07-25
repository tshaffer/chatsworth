import express, { Request, Response } from 'express';
import { getEmbedding } from '../utilities/embed';
import { pinecone } from '../pineconeClient';
import { ChatEntryModel } from '../models/ChatEntry';
import { ProjectModel } from '../models/Project';
import { Project, ChatEntry, SemanticSearchResultEntry, SemanticSearchResultChat, SemanticSearchResultProject } from '../types/entities';

export const semanticSearchRoute = async (req: Request, res: Response) => {
  const query = req.body.query;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  try {
    const queryVector = await getEmbedding(query);

    const index = pinecone.index(
      process.env.PINECONE_INDEX_NAME,
      process.env.PINECONE_INDEX_HOST
    );

    const result = await index.query({
      topK: 10,
      vector: queryVector,
      includeMetadata: true,
    });

    const matches = result.matches || [];
    const ids = matches.map((m) => m.id);

    // Hydrate full entries from MongoDB
    const entries: SemanticSearchResultEntry[] = await ChatEntryModel.find({
      _id: { $in: ids },
    }).lean();

    const entryMap: Record<string, SemanticSearchResultEntry> = {};
    entries.forEach((entry) => {
      entryMap[entry._id.toString()] = entry;
    });

    const sortedResults = matches
      .map((m) => ({
        score: m.score,
        entry: entryMap[m.id] || null,
      }))
      .filter((r) => r.entry !== null);

    // Group entries by chatId
    const chatGroups: Record<string, {
      chatId: string;
      projectId: string;
      entries: SemanticSearchResultEntry[];
    }> = {};

    for (const { entry } of sortedResults) {
      const { chatId, projectId } = entry;
      if (!chatGroups[chatId]) {
        chatGroups[chatId] = { chatId, projectId, entries: [] };
      }
      chatGroups[chatId].entries.push(entry);
    }

    const grouped = Object.values(chatGroups);

    // Load all project metadata
    const projects = await ProjectModel.find({}).lean();

    const resultStructure: SemanticSearchResultProject[] = projects
      .map((project: Project) => {
        const matchingChats: SemanticSearchResultChat[] = project.chats
          .map((chat) => {
            const group = grouped.find(
              (g) => g.chatId === chat.id && g.projectId === project.id
            );
            if (!group) return null;

            return {
              chatId: chat.id,
              chatTitle: chat.title,
              entries: group.entries,
            };
          })
          .filter((chat): chat is SemanticSearchResultChat => Boolean(chat));

        if (matchingChats.length === 0) return null;

        return {
          projectId: project.id,
          projectName: project.name,
          chats: matchingChats,
        };
      })
      .filter((project: any): project is SemanticSearchResultProject => Boolean(project));

    res.json({ results: resultStructure });
  } catch (err) {
    console.error('Semantic search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};
