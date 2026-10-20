/* =========================================================
   tasks.js · 写作与口语
   写作：句子翻译 → 段落仿写 → 小作文（图表）；口语：跟读与话题卡
   ========================================================= */

export const WRITING = {
  w1: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '用今天学的词，先求对，再求自然',
    lines: [
      { cn: '大多数孩子六岁开始上小学。', hints: ['start', 'primary school'], model: 'Most children start primary school at the age of six.', note: 'at the age of six 比 six years old 更书面。' },
      { cn: '这所学校提供很多课外活动。', hints: ['provide', 'after-school activities'], model: 'The school provides a wide range of after-school activities.', note: 'a wide range of 是雅思常用的「各种各样的」。' },
      { cn: '好老师能让学生对学习更有兴趣。', hints: ['motivate', 'be interested in'], model: 'A good teacher can motivate students to be more interested in learning.', note: 'motivate sb to do 是固定搭配。' },
      { cn: '阅读是提高词汇量最好的方法之一。', hints: ['one of the best ways', 'vocabulary'], model: 'Reading is one of the best ways to improve your vocabulary.', note: 'one of the best ways 后面接 to do。' },
      { cn: '如果学生每天复习，他们就不会忘记。', hints: ['revise', 'forget'], model: 'If students revise every day, they will not forget what they have learned.', note: '条件句：if + 现在时，主句用 will。' },
    ],
  },

  w2: {
    type: 'paragraph',
    title: '写一段「观点 + 理由 + 例子」',
    subtitle: '60–80 词；这是雅思大作文段落的标准骨架',
    prompt: 'Some people think children should start school at an earlier age. Do you agree? 用一段话表明你的立场，并给出一个理由和一个例子。',
    structure: ['① 观点句：I believe / In my view …', '② 理由：This is because …', '③ 例子：For example, …', '④ 收束：As a result, …'],
    words: ['early', 'benefit', 'develop', 'confidence', 'evidence', 'research'],
    model: 'In my view, children should not start formal schooling too early. This is because young children learn best through play, and pushing them to read and write before they are ready can reduce their confidence. For example, in Finland, formal education begins at seven, yet students there perform very well in international tests. As a result, a later start does not appear to hold children back.',
    modelZh: '在我看来，孩子不必过早开始正规学校教育。这是因为幼儿通过玩来学习效果最好，在他们准备好之前就逼着读写会削弱自信。例如在芬兰，正规教育七岁才开始，但那里的学生在国际测试中表现优异。因此，晚一点开始似乎并不会拖累孩子。',
    checklist: ['开头一句话亮明立场', '用 because 给出理由', '用一个具体例子（国家 / 研究 / 经历）', '结尾一句总结'],
  },

  w3: {
    type: 'chart',
    title: '小作文：描述一张柱状图',
    subtitle: 'Task 1 只需 3 句话：总趋势 → 最高 → 最低',
    chart: {
      title: 'Weekly hours spent on four activities by two age groups',
      unit: 'hours / week',
      groups: ['18–25', '26–40'],
      axis: [
        { label: 'Reading', v: [6, 3] },
        { label: 'Exercise', v: [4, 5] },
        { label: 'Screen time', v: [9, 6] },
        { label: 'Socialising', v: [7, 4] },
      ],
    },
    tips: ['用 while / whereas 对比两组', '最高值用 the highest / most', '趋势用 overall / in general 开头'],
    words: ['proportion', 'average', 'significant', 'while', 'compare', 'overall'],
    model: 'Overall, younger people spend more time on screens, reading and socialising, while the older group spends slightly more time exercising. Screen time is the highest for both groups, at nine hours a week for 18–25-year-olds compared with six hours for those aged 26–40. Reading shows the biggest difference: young people read six hours a week, whereas the older group reads only three.',
    modelZh: '总体而言，年轻人在屏幕、阅读和社交上花的时间更多，而年长一组锻炼略多。屏幕时间在两组中都是最高的——18–25 岁为每周九小时，26–40 岁为六小时。差距最大的是阅读：年轻人每周读六小时，而年长一组只有三小时。',
    checklist: ['第一句写 overall 总趋势', '用数字支撑（不要只写 many / few）', '用 while / whereas 做对比', '不写原因，不写个人观点'],
  },

  w4: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '这一组练「环境类」高频句式',
    lines: [
      { cn: '塑料袋对环境造成很大影响。', hints: ['plastic bags', 'have an impact on'], model: 'Plastic bags have a significant impact on the environment.' },
      { cn: '政府应该鼓励人们少开车。', hints: ['encourage', 'drive less'], model: 'The government should encourage people to drive less.' },
      { cn: '每年有数百万吨垃圾被倒进海里。', hints: ['millions of tonnes', 'dump'], model: 'Millions of tonnes of waste are dumped into the sea every year.' },
      { cn: '虽然回收很重要，但减少使用更有效。', hints: ['although', 'effective'], model: 'Although recycling is important, reducing consumption is more effective.' },
      { cn: '如果不采取措施，问题会变得更严重。', hints: ['take action', 'get worse'], model: 'If no action is taken, the problem will get worse.', note: 'If no action is taken 是被动语态的常用句式。' },
    ],
  },

  w5: {
    type: 'chart',
    title: '小作文：描述一张折线图',
    subtitle: 'Task 1 折线图：起点、终点、交叉点、极值',
    chart: {
      title: 'Share of households with internet access, 2000–2020',
      unit: '% of households',
      groups: ['Country A', 'Country B'],
      line: true,
      axis: [
        { label: '2000', v: [20, 5] },
        { label: '2005', v: [45, 15] },
        { label: '2010', v: [70, 40] },
        { label: '2015', v: [85, 65] },
        { label: '2020', v: [95, 88] },
      ],
    },
    tips: ['起点用 stood at / began at', '上升用 rose / increased steadily', '差距缩小用 the gap narrowed'],
    words: ['increase', 'significant', 'trend', 'proportion', 'compare', 'gradual'],
    model: 'The graph shows the percentage of households with internet access in two countries between 2000 and 2020. In country A, the figure rose steadily from 20% to 95%, while country B started much lower at 5% and grew more sharply after 2005. Although country A remained ahead throughout the period, the gap between the two narrowed considerably, from 25 percentage points in 2005 to just 7 in 2020.',
    modelZh: '该图显示 2000 至 2020 年间两个国家家庭互联网普及率的变化。A 国从 20% 稳步上升到 95%；B 国起点低得多，仅 5%，2005 年后增长更快。虽然 A 国始终领先，但两国差距明显缩小，从 2005 年的 25 个百分点降到 2020 年的 7 个百分点。',
    checklist: ['写清起止年份和单位', '描述趋势词（rise / grow / narrow）', '提到两组之间的关系或差距', '不加评论性原因'],
  },

  w6: {
    type: 'essay',
    title: '小作文 + 大作文提纲（二选一）',
    subtitle: '时间不够就只写提纲：观点、两个理由、一个例子',
    prompt: 'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?',
    outline: ['立场：部分同意（免费但设门槛）', '理由 1：机会平等，低收入家庭也能上大学', '理由 2：但完全免费会带来财政压力，可用奖学金代替', '例子：德国 / 北欧的模式与问题'],
    words: ['tuition', 'financial', 'equal', 'opportunity', 'government', 'benefit'],
    model: 'I partly agree that university education should be free. On the one hand, free tuition gives talented students from low-income families an equal opportunity to study, and a country benefits when more of its people are highly skilled. On the other hand, making all degrees free is extremely expensive, and the money may be better spent on scholarships for those who need them most. In Germany, for example, tuition is free, but universities have faced serious funding pressure. In short, support should target students in need rather than every student.',
    modelZh: '我部分同意大学教育应当免费。一方面，免学费让低收入家庭的优秀学生获得平等的求学机会，国民技能水平提升对国家也有益。另一方面，所有学位全免代价极高，这笔钱或许更适合用作给最需要者的奖学金。例如德国学费免费，但大学面临严重的经费压力。简言之，资助应针对有需要的学生，而不是所有学生。',
    checklist: ['立场明确（partly agree 也是立场）', '两个理由分正反', '有一个具体国家或研究的例子', '结尾不引入新观点'],
  },

  w7: {
    type: 'paragraph',
    title: '写一段「让步 + 反驳」',
    subtitle: '70–90 词；雅思 6 分段落的关键技能',
    prompt: 'Some people say technology makes us less social. Write one paragraph that admits one point in its favour, then argues against it.',
    structure: ['① 让步：It is true that …', '② 转折：However, …', '③ 反驳理由：…', '④ 例子或结论：…'],
    words: ['although', 'however', 'individual', 'face-to-face', 'impact', 'benefit'],
    model: 'It is true that smartphones can make people less social in some situations. It is common to see a group of friends sitting together, each looking at a screen instead of talking. However, this is a problem of how technology is used, not of technology itself. The same devices allow families in different countries to see each other every day, and they help shy people find communities they would never meet face to face. In my view, the impact depends on the habit, not the tool.',
    modelZh: '的确，手机在某些场合会让人变得不那么社交。常见几个朋友坐在一起，各自盯着屏幕而不交谈。然而，这是使用方式的问题，而非技术本身的问题。同样的设备让身处不同国家的家人每天都能见面，也能帮内向的人找到现实中难以接触的社群。在我看来，影响取决于习惯，而非工具。',
    checklist: ['第一句先承认对方有理（It is true that）', '用 However 明确转折', '反驳要有自己的理由，不只是重复', '结尾一句话收束'],
  },

  w8: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '这一组练「健康与建议」句式',
    lines: [
      { cn: '睡眠不足会影响你的记忆和情绪。', hints: ['lack of sleep', 'affect'], model: 'A lack of sleep can affect your memory and your mood.' },
      { cn: '专家建议每天在同一时间睡觉。', hints: ['recommend', 'at the same time'], model: 'Experts recommend going to bed at the same time every day.' },
      { cn: '规律运动有助于减轻压力。', hints: ['regular exercise', 'reduce stress'], model: 'Regular exercise helps reduce stress.' },
      { cn: '与其熬夜，不如早点睡、早上再做。', hints: ['rather than', 'stay up late'], model: 'Rather than staying up late, you should go to bed early and finish it in the morning.' },
      { cn: '总的来说，小习惯比大改变更容易坚持。', hints: ['overall', 'stick to'], model: 'Overall, small habits are easier to stick to than big changes.', note: 'stick to sth = 坚持某事。' },
    ],
  },
};

export const SPEAKING = {
  s1: {
    title: 'Part 1：Work or study',
    subtitle: '先答 3 句：直接回答 + 一个理由 + 一个小细节',
    questions: [
      { q: 'Do you work or are you a student?', tip: '直接说身份，再说专业/工作内容。' },
      { q: 'What do you like most about it?', tip: '说一个具体点，比如「能不断学到新东西」。' },
      { q: 'Would you like to change anything about it?', tip: '用 I wish / If I could, I would … 造句。' },
    ],
    model: 'I\'m a student at the moment. I\'m studying computer science, and I\'m in my final year. What I like most about it is that there\'s always something new to learn — for example, last term we built a small app from scratch. If I could change one thing, I\'d probably spend less time on exams and more time on real projects.',
    modelZh: '我现在是学生，读计算机专业，今年大四。我最喜欢的一点是总能学到新东西——比如上个学期我们从零做了一个小应用。如果我能改变一件事，我大概会减少考试、多花时间在真实项目上。',
    checks: ['没有背模板腔（不像念稿）', '每个问题答到 3 句左右', '用了 1 个具体例子', '语速平稳，没长时间卡顿'],
  },

  s2: {
    title: 'Part 2：Describe a place you like to study',
    subtitle: '1 分钟准备 → 说满 90 秒',
    card: {
      topic: 'Describe a place where you like to study.',
      points: ['where it is', 'what it looks like', 'what you usually do there', 'and explain why you like studying there'],
    },
    model: 'I\'d like to talk about a small café near my flat. It\'s about ten minutes away on foot, on a quiet street. It has maybe eight tables, a lot of plants, and the walls are covered with old books. I usually go there on Saturday mornings and work for two or three hours — reading, or writing up notes from the week. The reason I like it is that it\'s quiet but not silent. There\'s a low level of background noise, which actually helps me concentrate. At home, I get distracted by my phone and my bed. There, I order one coffee and I know I\'ll finish what I planned. It\'s also become a kind of ritual — going there tells my brain that it\'s time to work.',
    modelZh: '我想说我家附近的一家小咖啡馆，步行十分钟，在一条安静的街上。店里大概八张桌子，很多绿植，墙上摆满旧书。我通常周六早上去，待两三个小时，读书或者整理一周的笔记。我喜欢它的原因是它安静但不死寂，有一点背景噪音反而让我更专注。在家我会被手机和床分心；在那里，点一杯咖啡，我就知道今天计划的事能做完。它甚至成了一种仪式——去那里就像告诉大脑「该干活了」。',
    checks: ['四个提示点都覆盖到', '说到 90 秒左右', '有细节（距离、桌子、植物）', '结尾回答了 why'],
  },

  s3: {
    title: 'Part 3：Cities and transport',
    subtitle: 'Part 3 要「展开」，每个答案 4–5 句',
    questions: [
      { q: 'Why do so many people prefer to live in cities?', tip: '工作机会、医疗教育、社交生活。' },
      { q: 'How could cities encourage people to use public transport?', tip: '提高频率、降低票价、限制市中心停车。' },
      { q: 'Do you think cities will be more or less crowded in the future?', tip: '给一个判断 + 一个理由 + 一点让步。' },
    ],
    model: 'I think there are two main reasons. The first is economic — cities simply have more jobs, especially for young people. The second is convenience: hospitals, universities, shops and entertainment are all close together, so you don\'t need a car. To encourage public transport, I\'d start with frequency. People won\'t wait twenty minutes for a bus, but they will wait five. Cheaper tickets and fewer parking spaces in the centre would also help. As for the future, I suspect large cities will keep growing, though remote work may slow this down a little, because some people no longer need to live near their office.',
    modelZh: '我认为主要有两个原因。第一是经济——城市工作机会更多，尤其对年轻人。第二是便利：医院、大学、商店和娱乐都集中在一起，不需要开车。要鼓励公共交通，我会先从发车频率入手：没人愿意等二十分钟的公交，但五分钟可以。更低票价和减少市中心停车位也会有帮助。至于未来，我猜大城市会继续增长，不过远程工作可能会稍微减缓这一趋势，因为有些人不再需要住在办公室附近。',
    checks: ['每个问题都展开了（不是一句话结束）', '用 First / Second / As for 等连接词', '有让步（though / may）', '没有只背「万能句」'],
  },

  s4: {
    title: 'Part 2：Describe a healthy habit you have',
    subtitle: '1 分钟准备 → 说满 90 秒',
    card: {
      topic: 'Describe a healthy habit you have or would like to have.',
      points: ['what the habit is', 'when you started it', 'how it helps you', 'and explain how you keep it going'],
    },
    model: 'The habit I\'d like to talk about is walking after dinner. I started it about a year ago, when I realised I was sitting at a desk all day and sleeping badly. At first I just walked around the block for ten minutes, but now it\'s usually half an hour. It helps me in two ways. Physically, I feel less stiff, and I fall asleep faster. Mentally, it gives me time to think without a screen in front of me — I often work out problems from the day while I\'m walking. As for keeping it going, I\'ve made it very easy: I leave my shoes by the door, and I go at the same time every evening, so it doesn\'t require a decision. On rainy days I still go, just for ten minutes, because the routine matters more than the distance.',
    modelZh: '我想说的习惯是晚饭后散步。大约一年前开始的，那时我意识到自己整天坐在桌前、睡得很差。一开始只绕街区走十分钟，现在通常是半小时。它有两方面帮助：身体上没那么僵硬，也更容易入睡；心理上，它给了我不看屏幕的思考时间——我常在走路时想通白天的问题。至于坚持，我把它变得很容易：鞋子放在门口，每天固定时间出门，不需要做决定。下雨天我也走，只走十分钟，因为习惯本身比距离更重要。',
    checks: ['四个提示点都覆盖', '有「开始时 → 现在」的变化', '说了具体帮助（身体 + 心理）', '解释了怎么坚持'],
  },
};
