# 知乎原回答卡片替换与验收 · 2026-09-11

用户要求所有答案采用原始知乎回答，不再提炼；卡片保持统一，切换不同作者的回答。

## 当前实现

`web/cases/catalog.json` 的 9 个话题共 34 条答案均为正常公开页面展开后读取的原回答。保留作者、头像、段落、配图、原问题标题、发表/编辑时间及规范答案链接，`contentSha256` 记录读取时 HTML 的校验值。策划回答和人工概括已退出当前画布。旧来源对应的星球 ID 尽量保留，已有讨论与历史快照不重写。

悬停卡片沿用 9:16 外观，加入上一条、下一条与序号。切换时保留卡片尺寸和位置，更新作者、正文与来源，滚动回到开头。展开阅读采用同一布局，全文可独立滚动。移除旧的段落三行省略；图片按原文顺序显示，载入失败时提供原回答入口。

正文通过白名单重建语义 DOM；不执行来源里的脚本、事件、嵌入页或样式，图片只加载知乎图片域。原文内容作为引用数据，不作为程序指令。长原文可原样传入对谈，不再受旧 5,000 字材料限制。

## 来源清单

| 话题 | 原回答数 | 核对来源 |
|---|---:|---|
| 10 亿美元，换一只追杀你的蜗牛？ | 8 | [学生陈月半](https://www.zhihu.com/question/286619877/answer/483366139)、[童心](https://www.zhihu.com/question/286619877/answer/801370328)、[Real志](https://www.zhihu.com/question/286619877/answer/451065412)、[Yi Yang](https://www.zhihu.com/question/286619877/answer/451012053)、[老八](https://www.zhihu.com/question/286619877/answer/451262338)、[旅途中的奇诺](https://www.zhihu.com/question/286619877/answer/450945882)、[空心果](https://www.zhihu.com/question/286619877/answer/451416885)、[木寸上春树](https://www.zhihu.com/question/286619877/answer/1609186940) |
| 丧尸出现前，你还有三个小时 | 3 | [令姿](https://www.zhihu.com/question/370509834/answer/1023368502)、[知乎用户](https://www.zhihu.com/question/370509834/answer/1308818538)、[laq是只仓鼠](https://www.zhihu.com/question/370509834/answer/1034592419) |
| 你遇到过世界的 bug 吗？ | 3 | [悟空](https://www.zhihu.com/question/61917117/answer/192762547)、[匿名用户](https://www.zhihu.com/question/61917117/answer/203122650)、[宋芳](https://www.zhihu.com/question/61917117/answer/365383187) |
| 如果吃一小勺太阳会怎样？ | 3 | [瞻云](https://www.zhihu.com/question/52419881/answer/3380704164)、[Mandelbrot](https://www.zhihu.com/question/52419881/answer/131055050)、[谢必安](https://www.zhihu.com/question/52419881/answer/130870489) |
| 美术馆着火，救猫还是救画？ | 3 | [日寸三吉](https://www.zhihu.com/question/356196758/answer/902817528)、[肖x纱s碧b](https://www.zhihu.com/question/356196758/answer/901713292)、[一十一](https://www.zhihu.com/question/356196758/answer/903185632) |
| 电车难题，你会扳动道岔吗？ | 3 | [诉言科技文学社](https://www.zhihu.com/question/408598529/answer/1656518357)、[知乎用户](https://www.zhihu.com/question/408598529/answer/1357806466)、[知乎用户](https://www.zhihu.com/question/408598529/answer/1849907940) |
| 客厅消失了，还是换了种意义？ | 4 | [猫大发财](https://www.zhihu.com/question/2079581505047762015/answer/2079959003434578024)、[圏吉](https://www.zhihu.com/question/2079581505047762015/answer/2081179893652525846)、[知乎用户](https://www.zhihu.com/question/2079581505047762015/answer/2079870185859708128)、[独慕溪](https://www.zhihu.com/question/2079581505047762015/answer/2081753292317761899) |
| 15 元食堂挑战，你怎么搭配？ | 4 | [黑白漫步](https://www.zhihu.com/question/2076361721686357610/answer/2080307572972827078)、[拾叁](https://www.zhihu.com/question/2076361721686357610/answer/2081060966020793940)、[知乎用户](https://www.zhihu.com/question/2076361721686357610/answer/2078255677131207867)、[知乎用户](https://www.zhihu.com/question/2076361721686357610/answer/2078517401822421950) |
| 无人驾驶越来越近，该多快迎接它？ | 3 | [凯东知识产权](https://www.zhihu.com/question/661252701/answer/3558671344)、[黄裳](https://www.zhihu.com/question/661252701/answer/3558953420)、[弗兰克扬](https://www.zhihu.com/question/661252701/answer/3558742987) |

电车难题采用问题 408598529「对于电车难题你会怎么选择?」。其他杀一人救多人的变体未混入当前场景。萝卜快跑的三条原回答均发表于 2024 年 7 月，在线发现继续保留 2024 年时间边界。

## API 边界

[知乎问题回答接口文档](https://developer.zhihu.com/docs?key=question_answers)的 `Summary` 和搜索接口的 `ContentText` 不承诺完整正文。本次原文通过正常知乎页面展开读取，保存在目录中；不把 API 截取文本标为原文。API 发现的已知回答按 answerId 使用目录原文；未核对全文的新回答仅在来源面板提供外部原文入口，不覆盖目录正文。搜索响应中 ContentID 可能是有符号索引值，去重以规范 URL 中的真实 answerId 为准。

## 验收

- 桌面 1440×1000：逐一切换全部 34 条原回答，核对作者、来源 URL、正文首尾与长度、切换序号、滚动归零和对话框尺寸。循环切换回到第一条，未残留上一条内容。
- 9:16 卡片实测 306×544；切换前后尺寸、位置一致，长段落不被省略。太阳话题原配图实际加载成功。
- 手机视口 390×844：真实触摸事件打开星球，切换及展开成功，正文可滚动、图片加载成功，无横向溢出，对话框位于视口内。此项为手机视口模拟，不代表实体手机性能测试。
- 原文安全渲染：脚本、事件、危险链接、嵌入页及非知乎图片域不进入可执行 DOM；原始段落、加粗、引用和合法链接保留。
- 输入星球回归：粒子数量随输入从 19,800 → 37,370 → 138,401，持续旋转，提交前不创建观点历史。
- 关系回归：结伴光桥可见（2,886 个非透明像素），拖动后伙伴跟随；分歧碰撞产生位移（约 54 px），没有误入个人历史。此前音效模块未在本次原文替换中改动。
- 最终共享工作区自动检查：Node 44 项、Python 23 项通过，包含原文合并、摘要边界、来源快照、模型长文本传递和现有交互。

预览图：[桌面](previews/original-answer-desktop.png)、[手机](previews/original-answer-mobile.png)。

本次仅更新本机开发版本，未提交或发布。仓库中的其他视觉和对谈优化任务并行进行，原文来源集合及原文优先规则已同步协调。
