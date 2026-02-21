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
import { GitHub, Link as LinkIcon } from '@mui/icons-material'

export default function Info({ open, handleClose }) {
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="info-dialog-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="info-dialog-title">关于 Project Sekai 贴纸生成器</DialogTitle>
      <DialogContent>
        <Typography variant="h6" component="h3" gutterBottom>
          合并版说明
        </Typography>
        <Typography variant="body2" paragraph>
          本项目整合了两个优秀版本的全部功能和优点：
        </Typography>
        <List dense>
          <ListItem>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#cf93d9' }}>
                <GitHub />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="atnightcord/sekai-stickers"
              secondary="完整功能集（垂直文字、字间距、描边控制等）"
            />
          </ListItem>
          <ListItem>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#cf93d9' }}>
                <GitHub />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="BedrockDigger/sekai-stickers"
              secondary="精美的 Material-UI 界面和响应式设计"
            />
          </ListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" component="h3" gutterBottom>
          原始贡献者
        </Typography>
        <List dense>
          <ListItem
            button
            component="a"
            href="https://www.reddit.com/r/ProjectSekai/comments/x1h4v1/"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar
                alt="u/SherenPlaysGames"
                src="https://styles.redditmedia.com/t5_mygft/styles/profileIcon_n1kman41j5891.jpg"
              />
            </ListItemAvatar>
            <ListItemText primary="u/SherenPlaysGames" secondary="原始贴纸创作者" />
          </ListItem>
          <ListItem
            button
            component="a"
            href="https://github.com/theoriginalayaka"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar
                alt="Ayaka"
                src="https://avatars.githubusercontent.com/theoriginalayaka"
              />
            </ListItemAvatar>
            <ListItemText primary="Ayaka" secondary="最初的创意和实现" />
          </ListItem>
          <ListItem
            button
            component="a"
            href="https://github.com/modder4869"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar alt="Modder4869" src="https://avatars.githubusercontent.com/modder4869" />
            </ListItemAvatar>
            <ListItemText primary="Modder4869" secondary="代码贡献" />
          </ListItem>
          <ListItem
            button
            component="a"
            href="https://nightcord.de/@akiyamamizuki"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar
                alt="Mikan Harada"
                src="https://avatars.githubusercontent.com/u/13678847?v=4"
              />
            </ListItemAvatar>
            <ListItemText
              primary="Mikan Harada"
              secondary="@akiyamamizuki - atnightcord 版本维护者"
            />
          </ListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" component="h3" gutterBottom>
          项目链接
        </Typography>
        <List dense>
          <ListItem
            button
            component="a"
            href="https://github.com/atnightcord/sekai-stickers"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#24292e' }}>
                <GitHub />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="atnightcord/sekai-stickers"
              secondary="功能完整版源码"
            />
          </ListItem>
          <ListItem
            button
            component="a"
            href="https://github.com/BedrockDigger/sekai-stickers"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#24292e' }}>
                <GitHub />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary="BedrockDigger/sekai-stickers"
              secondary="UI 优化版源码"
            />
          </ListItem>
          <ListItem
            button
            component="a"
            href="https://github.com/TheOriginalAyaka/sekai-stickers"
            target="_blank"
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: '#24292e' }}>
                <GitHub />
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary="TheOriginalAyaka/sekai-stickers" secondary="最初版本源码" />
          </ListItem>
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
