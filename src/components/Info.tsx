// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'
import { GitHub, Favorite } from '@mui/icons-material'
import type { ReactNode } from 'react'
import { publicAsset } from '../utils/publicAsset'
import { isToyBuild } from '../utils/toy'

// Vite 编译时常量：toy 构建会完全移除非 toy 分支的代码和 URL 字符串
const URLS = {
  githubRepo: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/25-ji-code-de/stickers-maker',
  githubDev: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/bili-47177171806',
  bilibiliDev: import.meta.env.MODE === 'toy' ? '' : 'https://space.bilibili.com/3546904856103196',
  afdian: import.meta.env.MODE === 'toy' ? '' : 'https://afdian.com/a/1806P',
  redditSheren: import.meta.env.MODE === 'toy' ? '' : 'https://www.reddit.com/r/ProjectSekai/comments/x1h4v1/',
  githubAyaka: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/theoriginalayaka',
  githubModder: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/modder4869',
  githubBedrock: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/BedrockDigger',
  nightcordMikan: import.meta.env.MODE === 'toy' ? '' : 'https://nightcord.de/@akiyamamizuki',
  pjskMoe: import.meta.env.MODE === 'toy' ? '' : 'https://pjsk.moe',
  githubAtnightcord: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/atnightcord/sekai-stickers',
  githubBedrockRepo: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/BedrockDigger/sekai-stickers',
  githubAyakaRepo: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/TheOriginalAyaka/sekai-stickers',
  githubMoesekai: import.meta.env.MODE === 'toy' ? '' : 'https://github.com/StarMoe-org/MoeSekai-Hub',
}

interface LinkListItemProps {
  isToy: boolean
  href?: string
  children: ReactNode
}

/**
 * 可点击的列表行：非 toy 构建渲染为带链接的 button 行，
 * toy 构建（或无链接）渲染为静态行。
 * 拆成两个分支是因为 ListItem 的多态 component 与 button prop
 * 存在类型冲突（动态 component 下 button 要求字面量 false）。
 */
function LinkListItem({ isToy, href, children }: LinkListItemProps) {
  if (isToy || !href) {
    return <ListItem sx={{ cursor: 'default' }}>{children}</ListItem>
  }
  return (
    <ListItem button href={href} target="_blank">
      {children}
    </ListItem>
  )
}

interface InfoProps {
  open: boolean
  handleClose: () => void
}

export default function Info({ open, handleClose }: InfoProps) {
  const isToy = isToyBuild()

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="info-dialog-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="info-dialog-title">关于 Project SEKAI 贴纸生成器</DialogTitle>
      <DialogContent>
        <Typography variant="h6" component="h3" gutterBottom>
          本项目
        </Typography>
        <List dense>
          <LinkListItem isToy={isToy} href={URLS.githubRepo || undefined}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: 'rgb(228, 194, 200)' }}>
                <GitHub sx={{ color: 'rgb(67, 60, 61)' }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="25-ji-code-de/stickers-maker"
              secondary="本仓库 - Project SEKAI 贴纸生成器"
            />
          </LinkListItem>
          <ListItem>
            <ListItemAvatar>
              <Avatar
                alt="bili_47177171806"
                src={publicAsset('avatar.jpg')}
                sx={{ bgcolor: 'rgb(228, 194, 200)' }}
              />
            </ListItemAvatar>
            <ListItemText
              primary="bili_47177171806"
              secondary={
                isToy ? (
                  "项目开发者"
                ) : (
                  <>
                    项目开发者
                    <br />
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ display: 'block', mt: 0.5 }}
                    >
                      <a
                        href={URLS.githubDev}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginRight: 8 }}
                      >
                        GitHub
                      </a>
                      •
                      <a
                        href={URLS.bilibiliDev}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginLeft: 8 }}
                      >
                        Bilibili
                      </a>
                    </Typography>
                  </>
                )
              }
            />
          </ListItem>
        </List>

        {!isToy && URLS.afdian && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<Favorite />}
              href={URLS.afdian}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ borderRadius: 2 }}
            >
              支持项目开发
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" component="h3" gutterBottom>
          致谢与参考
        </Typography>
        <Typography variant="body2" paragraph color="text.secondary">
          本项目参考了社区多个优秀实现
        </Typography>
        <List dense>
          <LinkListItem isToy={isToy} href={URLS.redditSheren || undefined}>
            <ListItemAvatar>
              <Avatar
                alt="u/SherenPlaysGames"
                src={publicAsset('avatars/reddit-sheren.webp')}
              />
            </ListItemAvatar>
            <ListItemText primary="u/SherenPlaysGames" secondary="原始贴纸创作者" />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubAyaka || undefined}>
            <ListItemAvatar>
              <Avatar
                alt="Ayaka"
                src={publicAsset('avatars/theoriginalayaka.webp')}
              />
            </ListItemAvatar>
            <ListItemText primary="Ayaka" secondary="最初的创意和实现" />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubModder || undefined}>
            <ListItemAvatar>
              <Avatar alt="Modder4869" src={publicAsset('avatars/modder4869.webp')} />
            </ListItemAvatar>
            <ListItemText primary="Modder4869" secondary="代码贡献" />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubBedrock || undefined}>
            <ListItemAvatar>
              <Avatar alt="BedrockDigger" src={publicAsset('avatars/bedrockdigger.webp')} />
            </ListItemAvatar>
            <ListItemText primary="BedrockDigger" secondary="UI 设计贡献" />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.nightcordMikan || undefined}>
            <ListItemAvatar>
              <Avatar
                alt="Mikan Harada"
                src={publicAsset('avatars/mikan-harada.webp')}
              />
            </ListItemAvatar>
            <ListItemText
              primary="Mikan Harada"
              secondary="@akiyamamizuki - 代码贡献"
            />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.pjskMoe || undefined}>
            <ListItemAvatar>
              <Avatar alt="Moesekai" src={publicAsset('avatars/moesekai.webp')} />
            </ListItemAvatar>
            <ListItemText primary="Moesekai" secondary="贴纸底图来源" />
          </LinkListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" component="h3" gutterBottom>
          参考项目
        </Typography>
        <List dense>
          <LinkListItem isToy={isToy} href={URLS.githubAtnightcord || undefined}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#e1e4e8' }}>
                <GitHub sx={{ color: '#24292e' }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="atnightcord/sekai-stickers"
              secondary="功能参考"
            />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubBedrockRepo || undefined}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#e1e4e8' }}>
                <GitHub sx={{ color: '#24292e' }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="BedrockDigger/sekai-stickers"
              secondary="UI 参考"
            />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubAyakaRepo || undefined}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#e1e4e8' }}>
                <GitHub sx={{ color: '#24292e' }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary="TheOriginalAyaka/sekai-stickers" secondary="最初版本" />
          </LinkListItem>
          <LinkListItem isToy={isToy} href={URLS.githubMoesekai || undefined}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#e1e4e8' }}>
                <GitHub sx={{ color: '#24292e' }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="StarMoe-org/MoeSekai-Hub"
              secondary="贴纸底图来源"
            />
          </LinkListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          贴纸素材来自社区收集。如有侵权请联系删除。
          <br />
          如需贡献新贴纸，欢迎通过 GitHub 提交 Issue 或 PR。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="secondary">
          关闭
        </Button>
      </DialogActions>
    </Dialog>
  )
}
