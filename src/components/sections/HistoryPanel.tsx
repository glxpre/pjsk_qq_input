// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import {
  Box,
  Typography,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Delete, DeleteSweep, Restore, Link as LinkIcon } from '@mui/icons-material'
import { useState } from 'react'
import { HistoryItem } from '../../types'

interface HistoryPanelProps {
  historyItems: HistoryItem[]
  onLoadHistory: (id: string) => void
  onDeleteHistory: (id: string) => void
  onClearHistory: () => void
}

export default function HistoryPanel({
  historyItems,
  onLoadHistory,
  onDeleteHistory,
  onClearHistory,
}: HistoryPanelProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null)
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  const handleItemClick = (item: HistoryItem) => {
    setSelectedItem(item)
  }

  const handleRestore = () => {
    if (selectedItem) {
      onLoadHistory(selectedItem.id)
      setSelectedItem(null)
    }
  }

  const handleDelete = () => {
    if (selectedItem) {
      onDeleteHistory(selectedItem.id)
      setSelectedItem(null)
    }
  }

  const handleClearAll = () => {
    onClearHistory()
    setConfirmClearOpen(false)
  }

  if (historyItems.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="body2" color="text.secondary">
          暂无历史记录
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
          生成贴纸后会自动保存到这里
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" component="h3">
          历史记录 ({historyItems.length})
        </Typography>
        <Tooltip title="清空全部历史">
          <IconButton
            size="small"
            color="error"
            onClick={() => setConfirmClearOpen(true)}
          >
            <DeleteSweep />
          </IconButton>
        </Tooltip>
      </Box>

      <ImageList cols={isSmallScreen ? 3 : 4} gap={8} sx={{ maxHeight: 400, overflow: 'auto' }}>
        {historyItems.map((item) => (
          <ImageListItem
            key={item.id}
            sx={{
              cursor: 'pointer',
              '&:hover': { opacity: 0.8 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
            }}
            onClick={() => handleItemClick(item)}
          >
            <img
              src={item.thumbnail}
              alt={`历史记录 - ${formatTimestamp(item.timestamp)}`}
              loading="lazy"
              style={{
                objectFit: 'contain',
                backgroundColor: '#212121',
                aspectRatio: '296/256',
                width: '100%',
              }}
            />
            <ImageListItemBar
              title={formatTimestamp(item.timestamp)}
              subtitle={item.config.text.substring(0, 10) || '无文字'}
              sx={{
                '& .MuiImageListItemBar-title': { fontSize: '0.7rem' },
                '& .MuiImageListItemBar-subtitle': { fontSize: '0.6rem' },
              }}
            />
            {item.uploadedUrl && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  bgcolor: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: 1,
                  p: 0.5,
                }}
              >
                <LinkIcon sx={{ fontSize: 14, color: 'white' }} />
              </Box>
            )}
          </ImageListItem>
        ))}
      </ImageList>

      {/* Detail Dialog */}
      <Dialog
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedItem && (
          <>
            <DialogTitle>历史记录详情</DialogTitle>
            <DialogContent>
              <Box textAlign="center" mb={2}>
                <img
                  src={selectedItem.thumbnail}
                  alt="预览"
                  style={{
                    maxWidth: '100%',
                    border: '1px solid #444',
                    borderRadius: 4,
                    backgroundColor: '#212121',
                  }}
                />
              </Box>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                创建时间：{new Date(selectedItem.timestamp).toLocaleString('zh-CN')}
              </Typography>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                文字内容：{selectedItem.config.text || '（无）'}
              </Typography>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                字体大小：{selectedItem.config.fontSize}px
              </Typography>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                位置：X={selectedItem.config.position.x}, Y={selectedItem.config.position.y}
              </Typography>

              {selectedItem.uploadedUrl && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="caption">分享链接：</Typography>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{
                      wordBreak: 'break-all',
                      mt: 0.5,
                      fontFamily: 'monospace',
                    }}
                  >
                    {selectedItem.uploadedUrl}
                  </Typography>
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                startIcon={<Delete />}
                color="error"
                onClick={handleDelete}
              >
                删除
              </Button>
              <Button onClick={() => setSelectedItem(null)}>取消</Button>
              <Button
                variant="contained"
                startIcon={<Restore />}
                color="secondary"
                onClick={handleRestore}
              >
                恢复此配置
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <Dialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
      >
        <DialogTitle>确认清空历史记录？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            将删除全部 {historyItems.length} 条历史记录，此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={handleClearAll}>
            清空全部
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
