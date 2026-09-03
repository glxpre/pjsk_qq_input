// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import FavoriteIcon from '@mui/icons-material/Favorite'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { FAN_BONUS_AUTHOR_MID, FAN_BONUS_VIDEO_BVID, FAN_BONUS_FEATURE_LABELS, FAN_BONUS_TIERS } from '../config/fanBonus'
import type { FanBonusVideoInfo } from '../hooks/useFanBonus'

interface FanBonusDialogProps {
  open: boolean
  handleClose: () => void
  relationFollowed: boolean | null
  videoLiked: boolean | null
  videoInfo: FanBonusVideoInfo | null
  onRefresh: () => void
  refreshing: boolean
}

interface TaskCardProps {
  tier: 'like' | 'follow'
  done: boolean
  videoInfo: FanBonusVideoInfo | null
}

/** 在用户手势内跳转到 B 站内页面 */
async function navigateTo(req: ToySDK.NavigateReq): Promise<void> {
  try {
    await window.toy.navigate(req)
  } catch {
    // 跳转失败不打断流程，用户可手动搜索
  }
}

function TaskCard({ tier, done, videoInfo }: TaskCardProps) {
  const config = FAN_BONUS_TIERS[tier]
  const isLike = tier === 'like'

  const handleNavigate = () => {
    if (isLike) {
      void navigateTo({ type: 'video', id: FAN_BONUS_VIDEO_BVID })
    } else {
      void navigateTo({ type: 'space', id: FAN_BONUS_AUTHOR_MID })
    }
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        opacity: done ? 0.75 : 1,
      }}
    >
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        {isLike ? (
          <ThumbUpIcon color="secondary" fontSize="small" />
        ) : (
          <FavoriteIcon color="secondary" fontSize="small" />
        )}
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          {config.label}
        </Typography>
        {done ? (
          <Chip size="small" color="secondary" icon={<CheckCircleIcon />} label="已解锁" />
        ) : (
          <Chip size="small" variant="outlined" icon={<RadioButtonUncheckedIcon />} label="待完成" />
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        {config.description}
      </Typography>

      {isLike && videoInfo && (
        <Box display="flex" alignItems="center" gap={1} mt={1} mb={1}>
          <Box
            component="img"
            src={videoInfo.cover}
            alt={videoInfo.title}
            sx={{
              width: 96,
              height: 54,
              objectFit: 'cover',
              borderRadius: 1,
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden' }}>
            {videoInfo.title}
          </Typography>
        </Box>
      )}

      <Box mt={1} display="flex" flexWrap="wrap" gap={0.5}>
        {config.features.map((feature) => (
          <Chip key={feature} size="small" label={FAN_BONUS_FEATURE_LABELS[feature]} />
        ))}
      </Box>

      {!done && (
        <Button
          variant="contained"
          color="secondary"
          size="small"
          onClick={handleNavigate}
          sx={{ mt: 1.5 }}
        >
          {isLike ? '去点赞' : '去关注'}
        </Button>
      )}
    </Paper>
  )
}

export default function FanBonusDialog({
  open,
  handleClose,
  relationFollowed,
  videoLiked,
  videoInfo,
  onRefresh,
  refreshing,
}: FanBonusDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="fan-bonus-dialog-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="fan-bonus-dialog-title">粉丝福利 ✨</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" paragraph>
          简单动动手指，解锁贴纸生成器的专属能力（完成后回来点「刷新状态」即可生效）：
        </Typography>

        <TaskCard tier="follow" done={relationFollowed === true} videoInfo={null} />
        <TaskCard tier="like" done={videoLiked === true} videoInfo={videoInfo} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onRefresh} disabled={refreshing} color="secondary">
          刷新状态
        </Button>
        <Button onClick={handleClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
