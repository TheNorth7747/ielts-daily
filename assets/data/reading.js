/* =========================================================
   reading.js · 阅读材料
   - READING：短文 + 4 道单选，练「读懂大意 + 定位细节」
   - 文本里用 [[...]] 包住的是本课关键词，阅读时会高亮并可查词
   ========================================================= */

export const READING = {
  r1: {
    title: 'Why Finnish Schools Start Late',
    cn: '为什么芬兰学校上课那么晚',
    words: 268,
    level: '4.5–5.0',
    topic: '教育',
    glossary: {
      compulsory: '强制的；义务的',
      municipality: '市政当局',
      autonomy: '自主权',
      influential: '有影响力的',
      curriculum: '课程体系',
      priority: '优先事项',
    },
    text: [
      'In Finland, most children do not walk into a classroom until they are seven. Before that, they spend their days in play-based early education, where the main [[goal]] is not reading or counting but learning how to be with other people. Many visitors find this surprising. In their own countries, formal [[education]] starts much earlier, and children are expected to read simple words by the age of five.',
      'Yet Finland has one of the most [[successful]] school systems in the world. Its students often [[perform]] well in international tests, although they spend fewer hours in class than students in many other countries. A typical school day begins around nine in the morning and ends in the early afternoon. [[Homework]] is light, and there are long breaks between lessons.',
      'One reason for this approach is the way teachers are [[trained]]. In Finland, teaching is a [[popular]] career, and primary teachers must complete a master\'s degree. They are given a lot of [[freedom]] in how to teach. The national [[curriculum]] sets broad goals, but teachers decide which [[method]]s to use and how to [[assess]] their students. Trust, rather than control, is the [[central]] [[principle]] of the system.',
      'Another reason is the belief that childhood should not be a race. Finnish educators argue that play, rest and time outdoors are not [[waste]]d time. They help children [[develop]] [[confidence]] and the ability to work with others. When formal learning begins, children are usually ready for it. They also tend to [[remain]] curious, which many teachers think matters more than early [[achievement]].',
    ],
    questions: [
      {
        q: 'According to the passage, what is the main aim of early education in Finland?',
        opts: [
          'Learning to read before the age of five',
          'Learning how to get along with other people',
          'Preparing for international tests',
          'Memorising numbers and letters',
        ],
        a: 1,
        why: '第一段直接说 the main goal is not reading or counting but learning how to be with other people，即学会与人相处。',
      },
      {
        q: 'What can be inferred about Finnish students from the second paragraph?',
        opts: [
          'They study longer hours than students elsewhere',
          'They receive a great deal of homework',
          'They achieve good results with relatively short school days',
          'They rarely take part in international tests',
        ],
        a: 2,
        why: '第二段对比：课时更少、作业轻，却在国际测试中表现好——用较少的时间取得好成绩。',
      },
      {
        q: 'The word "autonomy" in the text is closest in meaning to —',
        opts: ['control', 'freedom', 'training', 'pressure'],
        a: 1,
        why: '第三段说教师在教学方式上有很大 freedom / autonomy（自主权），两者同义。注意原文用的是 freedom，题目换成 autonomy 考查同义替换。',
      },
      {
        q: 'The writer\'s attitude towards the Finnish system is best described as —',
        opts: ['doubtful', 'critical', 'supportive', 'neutral and distant'],
        a: 2,
        why: '全文用 successful、trust 等正面词，并解释其理念，整体是赞赏、支持的态度。',
      },
    ],
  },

  r2: {
    title: 'The Hidden Cost of Fast Fashion',
    cn: '快时尚的隐形代价',
    words: 281,
    level: '5.0',
    topic: '环境',
    glossary: {
      affordable: '买得起的',
      trend: '潮流',
      landfill: '垃圾填埋场',
      enormous: '巨大的',
      consume: '消耗',
      alternative: '替代方案',
    },
    text: [
      'A new T-shirt costs less than a cup of coffee in many cities. This seems like good news for shoppers, and it is one reason why fast fashion has become so [[popular]]. Clothes are cheap, [[fashionable]] and easy to replace. But the low price hides an [[enormous]] cost that is paid somewhere else — by the environment, and often by the people who make the clothes.',
      'The fashion industry uses a huge [[amount]] of water. Growing cotton for one T-shirt may require more than 2,000 litres of water. Dyes and chemicals used in production often flow into rivers, [[polluting]] the water that local people depend on. The [[impact]] does not stop when a garment is sold. Each year, millions of tonnes of clothing end up in [[landfill]]s, where some materials take decades to [[break]] down.',
      'There is also a human side. Many clothes are made in factories where workers earn very little and work long hours. Because big brands can move orders quickly from one country to another, factories are under [[pressure]] to keep costs low. Safety is sometimes [[ignored]] in the race to produce more, faster and cheaper.',
      'Some [[change]] is beginning. Second-hand shops and clothing rental services are growing, and a few brands now [[publish]] lists of the factories they use. Consumers can also help by buying less and choosing clothes that last. However, [[individual]] choices alone are unlikely to [[solve]] the problem. [[Government]]s can set rules on chemical use, and companies need to [[accept]] responsibility for the full life of their products, from the cotton field to the recycling bin.',
    ],
    questions: [
      {
        q: 'Why does the writer say the low price of clothes "hides" a cost?',
        opts: [
          'Because shoppers pay with credit cards',
          'Because the real costs are paid by the environment and workers',
          'Because the clothes are of poor quality',
          'Because the price includes hidden taxes',
        ],
        a: 1,
        why: '第一段末：低价的代价由环境和制衣工人承担，这是「藏着」的成本。',
      },
      {
        q: 'Which environmental problem is NOT mentioned in the passage?',
        opts: [
          'Large water use in cotton farming',
          'Chemical pollution of rivers',
          'Clothing waste in landfills',
          'Air pollution from delivery trucks',
        ],
        a: 3,
        why: '第二段提到水、化学染料、填埋，没有提到配送卡车的空气污染——典型的 NOT 题，要逐项回原文核对。',
      },
      {
        q: 'What does the passage suggest about factory workers?',
        opts: [
          'They are well protected by law',
          'They often move abroad for work',
          'They face pressure from low-cost competition',
          'They are paid more than before',
        ],
        a: 2,
        why: '第三段：品牌随时转移订单，工厂为了压低成本而承压，安全有时被忽视。',
      },
      {
        q: 'What is the writer\'s main point in the last paragraph?',
        opts: [
          'Individual action is enough to fix the problem',
          'Both consumers and governments have a role to play',
          'Second-hand shops will replace new clothing',
          'Brands should stop publishing factory lists',
        ],
        a: 1,
        why: '末段先肯定消费者作用，再用 However 转折说个人选择不够，政府和企业也要负责——双方都有责任。',
      },
    ],
  },

  r3: {
    title: 'Working From Anywhere',
    cn: '在哪里都能工作',
    words: 274,
    level: '5.0–5.5',
    topic: '工作',
    glossary: {
      flexible: '灵活的',
      commute: '通勤',
      productivity: '生产率',
      isolate: '使孤立',
      colleague: '同事',
      boundary: '界限',
    },
    text: [
      'Not long ago, "going to work" meant leaving home and travelling to an office. Today, millions of people do their jobs from kitchens, libraries or cafes. The shift to [[remote]] work, which sped up during the pandemic, has changed not only where we work but also how we think about work itself.',
      'Supporters point to clear [[benefits]]. Without a daily [[commute]], employees save time and money. They can [[choose]] working hours that suit their energy levels, and parents can fit work around family life. Companies benefit too: they can [[employ]] talented people who live far away, and they need less office space. Some studies suggest that [[productivity]] stays the same or even rises when people work from home.',
      'Yet remote work is not perfect. Many people say they miss the small [[conversations]] that happen by chance in an office — the ones that lead to new ideas or solve a problem in five minutes. New employees find it harder to learn the [[culture]] of a company when they have never met their [[colleagues]] face to face. And when home and work share the same space, it becomes difficult to [[separate]] them. Some workers report checking messages late at night and feeling that they are never really off duty.',
      'The most [[common]] solution is a mixed [[model]]: a few days in the office, a few days at home. This keeps the [[flexibility]] people value while protecting the human contact that teams need. What matters most, researchers say, is not the number of days in an office but whether workers and managers agree on clear [[expectations]]. Without that, even a perfect office cannot make a team work well.',
    ],
    questions: [
      {
        q: 'What is the passage mainly about?',
        opts: [
          'Why offices are becoming more expensive',
          'The advantages and disadvantages of remote work',
          'How to find a job that allows travel',
          'The history of the modern office',
        ],
        a: 1,
        why: '全文结构：现象 → 好处 → 问题 → 折中方案，主旨是远程工作的利与弊。',
      },
      {
        q: 'According to the passage, one benefit for companies is that they can —',
        opts: [
          'pay employees less',
          'hire people who live far away',
          'avoid training new staff',
          'close all their offices',
        ],
        a: 1,
        why: '第二段：they can employ talented people who live far away，还能少租办公室，但不是「全关办公室」。',
      },
      {
        q: 'Why do new employees find remote work difficult?',
        opts: [
          'They cannot use office equipment',
          'They are not paid during training',
          'They have less access to a company\'s culture',
          'They must work longer hours',
        ],
        a: 2,
        why: '第三段：没面对面见过同事，更难了解公司文化。',
      },
      {
        q: 'What do researchers say is most important for a mixed model?',
        opts: [
          'A fixed number of office days',
          'A larger office building',
          'Clear agreement on expectations',
          'More frequent video calls',
        ],
        a: 2,
        why: '末句：关键不是办公天数，而是双方对期望有清晰共识。',
      },
    ],
  },

  r4: {
    title: 'The Truth About Sleep',
    cn: '关于睡眠的真相',
    words: 276,
    level: '5.5',
    topic: '健康',
    glossary: {
      memory: '记忆',
      immune: '免疫的',
      consistent: '规律的',
      caffeine: '咖啡因',
      average: '平均的',
      recover: '恢复',
    },
    text: [
      'Sleep looks like wasted time. We lie still for eight hours, doing nothing that can be seen. For centuries, some thinkers believed sleep was simply a pause, a break from real life. Modern science tells a very different story: while the body rests, the brain is busy [[processing]] the day.',
      'During deep sleep, the brain [[repeats]] information collected during the day and moves it into long-term [[memory]]. Students who sleep well after studying remember more than those who stay up late. Sleep also [[supports]] the [[immune]] system, helping the body fight illness, and it [[regulates]] the hormones that control hunger. People who regularly sleep too little are more likely to gain weight and to feel anxious.',
      'The problem is that many of us treat sleep as something we can [[reduce]] when we are busy. We stay up to finish work, watch one more episode, or scroll through our phones in bed. Light from screens tells the brain that it is still daytime, so the body produces less of the hormone that makes us sleepy. Coffee late in the afternoon has a similar [[effect]], because caffeine stays in the body for hours.',
      'The good news is that sleep can be [[improved]] fairly quickly. Experts suggest keeping a [[consistent]] schedule, even at weekends; going to bed only when tired; and keeping the bedroom dark and cool. Exercise during the day helps too. None of these [[habits]] is dramatic, but together they can [[increase]] the [[average]] night\'s sleep by an hour or more. And that hour, researchers say, is one of the best [[investments]] you can make in your health.',
    ],
    questions: [
      {
        q: 'What does modern science say about sleep?',
        opts: [
          'It is a waste of time',
          'It is when the brain does important work',
          'It only rests the body',
          'It has no effect on memory',
        ],
        a: 1,
        why: '第一段：大脑在睡眠中忙着处理白天的信息，并非浪费时间。',
      },
      {
        q: 'According to the passage, students who sleep well after studying —',
        opts: [
          'remember more than those who stay up late',
          'need less sleep the next day',
          'feel more anxious during exams',
          'prefer to study at night',
        ],
        a: 0,
        why: '第二段原句：Students who sleep well after studying remember more than those who stay up late.',
      },
      {
        q: 'Why is using a phone in bed a problem?',
        opts: [
          'It makes the room too bright to clean',
          'It increases the body\'s need for caffeine',
          'Screen light makes the brain think it is daytime',
          'It stops the body from producing hormones at all',
        ],
        a: 2,
        why: '第三段：屏幕光告诉大脑现在还是白天，于是睡眠激素分泌减少。',
      },
      {
        q: 'Which of the following is NOT suggested by experts?',
        opts: [
          'Keeping the same sleep schedule at weekends',
          'Exercising during the day',
          'Keeping the bedroom dark and cool',
          'Sleeping longer at weekends to catch up',
        ],
        a: 3,
        why: '专家建议周末也保持规律作息（反而不要靠周末补觉）。',
      },
    ],
  },
};
