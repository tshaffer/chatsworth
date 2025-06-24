import { Button } from "@mui/material";
import { useEffect, useState } from "react";
import { useDispatch } from 'react-redux';
import axios from 'axios';

import { ParsedMarkdown, Project } from "../types";
import ImportFromDriveDialog from "./ImportFromDriveDialog";
import ChatViewer from "./ChatViewer";

import { appendParsedMarkdown, setParsedMarkdown } from '../redux/parsedMarkdownSlice';

const AppShell = () => {
  const dispatch = useDispatch();

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);

  const handleAppendParsedMarkdown = (parsedMarkdown: ParsedMarkdown) => {
    dispatch(appendParsedMarkdown(parsedMarkdown));
  };

  const handleCloseMarkdownDialog = () => {
    setShowImportMarkdownDialog(false);
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get<{ projects: Project[] }>('/api/v1/projects');
        const parsedMarkdown: ParsedMarkdown = {
          projects: response.data.projects
        };
        dispatch(setParsedMarkdown(parsedMarkdown));
      } catch (error) {
        console.error('Error loading projects:', error);
      }
    };

    fetchProjects();
  }, [dispatch]);

  return (
    <div>
      <h1>Chatsworth</h1>
      <Button onClick={() => setShowImportMarkdownDialog(true)}>
        Import Markdown
      </Button>
      <ImportFromDriveDialog
        open={showImportMarkdownDialog}
        onAppendParsedMarkdown={handleAppendParsedMarkdown}
        onClose={handleCloseMarkdownDialog}
      />
      <ChatViewer />
    </div>
  );
};

export default AppShell;
