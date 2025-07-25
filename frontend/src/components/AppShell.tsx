// AppShell.tsx
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  CssBaseline,
  Drawer,
  Toolbar,
  AppBar,
  Typography,
  Divider,
} from '@mui/material';
import ProjectList from './ProjectList';
import ChatView from './ChatView';
import SearchBar from './SearchBar';
import { fetchProjects } from '../redux/projectsSlice';
import { AppDispatch, RootState } from '../redux/store';
import axios from 'axios';
import {
  SemanticSearchResults,
  SemanticSearchResultProject,
} from '../types';

const drawerWidth = 444;

const AppShell: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'fulltext' | 'semantic'>('fulltext');
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResults | null>(null);
  const selectedChatId = useSelector((state: RootState) => state.projects.selectedChatId);

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (searchMode === 'fulltext') {
      setSemanticResults(null); // Reset
    } else {
      try {
        const response = await axios.post('/api/v1/semantic-search', { query });
        const data: { results: SemanticSearchResults } = response.data;
        setSemanticResults(data.results);
      } catch (err) {
        console.error('Semantic search error:', err);
        setSemanticResults(null);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery(null);
    setSemanticResults(null);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Chatsworth
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <ProjectList searchQuery={searchQuery} semanticResults={semanticResults} />
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          paddingTop: '164px',
        }}
      >
        <Box
          sx={{
            position: 'fixed',
            top: '64px',
            left: drawerWidth,
            right: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            backgroundColor: 'background.paper',
            padding: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            query={searchQuery ?? ''}
            mode={searchMode}
            onModeChange={setSearchMode}
          />
          <Divider sx={{ mt: 1 }} />
        </Box>

        <ChatView selectedChatId={selectedChatId} searchQuery={searchQuery} semanticResults={semanticResults} />
      </Box>
    </Box>
  );
};

export default AppShell;
