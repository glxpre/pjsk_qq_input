import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { useMemo } from 'react'

export default function ThemeWrapper({ dominantColor, backgroundColor, children }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          primary: {
            main: dominantColor,
          },
          secondary: {
            main: dominantColor,
          },
          background: {
            default: backgroundColor,
            paper: backgroundColor,
          },
          text: {
            primary: dominantColor,
          },
        },
        typography: {
          fontFamily: 'YurukaStd, SSFangTangTi, sans-serif',
        },
        components: {
          MuiSlider: {
            styleOverrides: {
              thumb: {
                color: dominantColor,
              },
              track: {
                color: dominantColor,
              },
            },
          },
          MuiSwitch: {
            styleOverrides: {
              switchBase: {
                '&.Mui-checked': {
                  color: dominantColor,
                },
              },
            },
          },
        },
      }),
    [dominantColor, backgroundColor]
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
