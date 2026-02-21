import {
  ImageList,
  ImageListItem,
  Dialog,
  DialogContent,
  DialogTitle,
  TextField,
  IconButton,
  Tooltip,
  useMediaQuery,
} from '@mui/material'
import { useState, useMemo, useCallback } from 'react'
import characters from '../characters.json'
import { PersonSearch } from '@mui/icons-material'

const pickerItemSx = {
  cursor: 'pointer',
  '&:hover': {
    opacity: 0.7,
  },
  '&:active': {
    opacity: 0.9,
  },
}

export default function Picker({ setCharacter, color }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const isSmallScreen = useMediaQuery('(max-width:600px)')

  const handleOpen = useCallback(() => {
    setOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleCharacterSelect = useCallback((index) => {
    handleClose()
    setCharacter(index)
  }, [handleClose, setCharacter])

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value)
  }, [])

  const renderedItems = useMemo(() => {
    const s = search.toLowerCase()
    return characters.reduce((acc, c, index) => {
      if (
        s === '' ||
        s === c.id ||
        c.name.toLowerCase().includes(s) ||
        c.character.toLowerCase().includes(s)
      ) {
        acc.push(
          <ImageListItem
            key={index}
            onClick={() => handleCharacterSelect(index)}
            sx={pickerItemSx}
          >
            <img
              src={`/img/${c.img}`}
              srcSet={`/img/${c.img}`}
              alt={c.name}
              loading="lazy"
              style={{ borderRadius: '8px' }}
            />
          </ImageListItem>
        )
      }
      return acc
    }, [])
  }, [search, handleCharacterSelect])

  return (
    <>
      <Tooltip title="选择角色">
        <IconButton
          color="secondary"
          onClick={handleOpen}
          sx={{ color: color }}
          size="small"
        >
          <PersonSearch />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>选择角色</DialogTitle>
        <DialogContent>
          <TextField
            label="搜索角色"
            size="small"
            color="secondary"
            value={search}
            fullWidth
            onChange={handleSearchChange}
            sx={{ mb: 2 }}
          />
          <ImageList
            sx={{
              width: '100%',
              maxHeight: 450,
            }}
            cols={isSmallScreen ? 3 : 4}
            rowHeight={140}
          >
            {renderedItems}
          </ImageList>
        </DialogContent>
      </Dialog>
    </>
  )
}
