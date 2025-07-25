import React from 'react';
import {
  TextField,
  IconButton,
  Box,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

interface Props {
  onSearch: (query: string, mode: 'fulltext' | 'semantic') => void;
  onClear: () => void;
  query: string;
  mode: 'fulltext' | 'semantic';
  onModeChange: (mode: 'fulltext' | 'semantic') => void;
}

export default function SearchBar({
  onSearch, onClear, query, mode, onModeChange,
}: Props) {
  const [inputValue, setInputValue] = React.useState(query);

  React.useEffect(() => {
    setInputValue(query);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) onSearch(inputValue.trim(), mode);
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <TextField
        fullWidth
        size="small"
        label="Search Chats"
        variant="outlined"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        InputProps={{
          endAdornment: inputValue && (
            <InputAdornment position="end">
              <IconButton onClick={handleClear} edge="end" size="small">
                <ClearIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, value) => { if (value) onModeChange(value); }}
        size="small"
        sx={{ ml: 1 }}
      >
        <ToggleButton value="fulltext">Keyword</ToggleButton>
        <ToggleButton value="semantic">Semantic</ToggleButton>
      </ToggleButtonGroup>

      <IconButton type="submit">
        <SearchIcon />
      </IconButton>
    </Box>
  );
}
