import { ConfigProvider, App as AntApp } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { RouterProvider } from 'react-router'
import { router } from './router'

export function App() {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: { colorPrimary: '#1d5fd0', borderRadius: 6, fontSize: 14 },
        components: { Table: { headerBg: '#f2f5fa', cellPaddingBlockSM: 6 } },
      }}
    >
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  )
}
