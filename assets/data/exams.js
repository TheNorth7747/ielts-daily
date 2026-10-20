/* =========================================================
   exams.js · 真题模考套题
   两套完整的「听力 + 阅读」40 题，按雅思 Academic 的题型组织：
   单选题 / 摘要填空 / 表格填空 / 匹配。
   音频仍由浏览器语音合成朗读，所以不需要音频文件。

   题目结构：
   { type:'mcq',  prompt, options:[...], answer:0, why }
   { type:'match',prompt, options:[...], answer:1, why }
   { type:'blank',prompt, answer:'...', why, trailing }
   ========================================================= */

const SET_A = {
  /* =======================================================
     套题 A
     ======================================================= */
    id: 'setA',
    name: '模考 A · 城市绿地的四十分钟',
    subtitle: '听力 4 部分 + 阅读 3 篇，共 40 题',
    level: '5.0 – 6.0',
    listening: {
      title: 'Listening',
      minutes: 30,
      parts: [
        {
          part: 1,
          title: 'Part 1 · 预订社区活动室',
          intro: 'A conversation between a student and a community centre officer.',
          script: [
            { s: 'Receptionist', t: 'Good morning, Riverside Community Centre. How can I help?' },
            { s: 'Student', t: 'Hi, I\'d like to book a room for a graduation party. We\'re a group of about thirty people.' },
            { s: 'Receptionist', t: 'Thirty should be fine for the Garden Room. It holds up to forty. When is the party?' },
            { s: 'Student', t: 'The twenty-first of June, from seven until eleven in the evening.' },
            { s: 'Receptionist', t: 'Let me check. I\'m sorry, the Garden Room is already booked that evening. The Riverside Hall is free, but it\'s larger and a little more expensive.' },
            { s: 'Student', t: 'How much is it?' },
            { s: 'Receptionist', t: 'The Garden Room is ninety pounds for four hours. The Riverside Hall is one hundred and forty.' },
            { s: 'Student', t: 'That\'s fine. We can share the cost. Is there a kitchen we can use?' },
            { s: 'Receptionist', t: 'Yes, the hall has a small kitchen, but there\'s a fifty-pound deposit for the key. You get it back afterwards as long as everything is clean.' },
            { s: 'Student', t: 'No problem. Do we need to bring our own chairs?' },
            { s: 'Receptionist', t: 'Chairs and tables are included. You only need to bring plates and glasses, or we can hire them from the café for twenty pounds.' },
            { s: 'Student', t: 'We\'ll borrow from the café. Can I pay the deposit by card now?' },
            { s: 'Receptionist', t: 'Yes, but the booking isn\'t confirmed until the full amount is paid. The balance is due one week before the event.' },
            { s: 'Student', t: 'Understood. One last thing — is there somewhere to park?' },
            { s: 'Receptionist', t: 'There\'s a car park at the back, but it\'s for staff only. Guests usually park on Mill Street, which is free after six.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 1–5',
              instruction: 'Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.',
              table: [
                ['Event', 'graduation party'],
                ['Number of guests', '1 ______'],
                ['Date', '2 ______ June'],
                ['Room booked', '3 ______ Hall'],
                ['Cost of hall', '£ 4 ______'],
                ['Deposit for key', '£ 5 ______'],
              ],
              questions: [
                { no: 1, type: 'blank', answer: '30', accept: ['thirty', '30 people'], why: '对话开头学生说 a group of about thirty people。' },
                { no: 2, type: 'blank', answer: '21', accept: ['21st', 'twenty-first', 'twenty first'], why: 'The twenty-first of June。' },
                { no: 3, type: 'blank', answer: 'Riverside', why: 'Garden Room 已被订走，最后订的是 Riverside Hall。' },
                { no: 4, type: 'blank', answer: '140', accept: ['£140', 'one hundred and forty'], why: 'The Riverside Hall is one hundred and forty pounds.' },
                { no: 5, type: 'blank', answer: '50', accept: ['£50', 'fifty'], why: 'a fifty-pound deposit for the key。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 6–10',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 6, type: 'mcq', prompt: 'What does the hall include in the price?', options: ['Plates and glasses', 'Chairs and tables', 'A member of staff'], answer: 1, why: 'Chairs and tables are included. 餐具要么自带，要么向咖啡厅租。' },
                { no: 7, type: 'mcq', prompt: 'What will the student do about plates and glasses?', options: ['Borrow them from the café', 'Bring them from home', 'Buy paper ones'], answer: 0, why: 'We\'ll borrow from the café（花 20 镑租）。' },
                { no: 8, type: 'mcq', prompt: 'When must the full amount be paid?', options: ['When booking', 'One week before the event', 'On the day of the event'], answer: 1, why: 'The balance is due one week before the event. 注意 balance（余款）不是订金。' },
                { no: 9, type: 'mcq', prompt: 'Where can guests park?', options: ['At the back of the centre', 'On Mill Street', 'In the school car park'], answer: 1, why: '后面的停车场只给员工，客人停在 Mill Street。' },
                { no: 10, type: 'mcq', prompt: 'When is parking free?', options: ['All day', 'After six in the evening', 'At weekends only'], answer: 1, why: 'Mill Street ... is free after six。' },
              ],
            },
          ],
        },
        {
          part: 2,
          title: 'Part 2 · 社区图书馆介绍',
          intro: 'A talk given by the manager of a new community library.',
          script: [
            { s: 'Speaker', t: 'Welcome to the Northside Community Library. I\'m going to tell you a little about what we offer and how to use the building.' },
            { s: 'Speaker', t: 'The library opened three years ago in what used to be a primary school. The building was empty for almost a decade before the council decided to renovate it. We kept the original wooden floors and most of the windows, which is why the reading room is so bright.' },
            { s: 'Speaker', t: 'On the ground floor you\'ll find the children\'s section and the café. The first floor has the main collection and the quiet study area. The second floor is for meetings and events, and it can be booked by local groups free of charge.' },
            { s: 'Speaker', t: 'Membership is free for anyone who lives in the area. You can borrow up to twelve items for three weeks, and renew them twice online. We also lend laptops, which can be used inside the building only.' },
            { s: 'Speaker', t: 'Our most popular service is the homework club. It runs every weekday from four to six during term time, and it\'s staffed by volunteers, many of them retired teachers. Last year we helped more than four hundred students.' },
            { s: 'Speaker', t: 'We also run a monthly repair café. People bring broken small appliances, and volunteers show them how to fix things rather than throw them away. It takes place on the first Saturday of the month, from ten until one.' },
            { s: 'Speaker', t: 'Finally, a word about noise. The ground floor is a social space, so please talk normally. If you need silence, go up to the first floor. And please don\'t bring food into the reading areas — drinks with lids are fine.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 11–15',
              instruction: 'Complete the notes below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.',
              table: [
                ['Building was formerly a', '11 ______'],
                ['Empty for nearly', '12 ______ years'],
                ['Meeting rooms can be booked', '13 ______ of charge'],
                ['Borrow up to 14 ______ items'],
                ['Homework club runs', '15 ______ to six'],
              ],
              questions: [
                { no: 11, type: 'blank', answer: 'primary school', why: 'in what used to be a primary school。' },
                { no: 12, type: 'blank', answer: 'ten', accept: ['10'], why: 'empty for almost a decade = nearly ten years。' },
                { no: 13, type: 'blank', answer: 'free', why: 'can be booked by local groups free of charge。' },
                { no: 14, type: 'blank', answer: '12', accept: ['twelve'], why: 'borrow up to twelve items。' },
                { no: 15, type: 'blank', answer: 'four', accept: ['4', '4pm', 'four o\'clock'], why: 'every weekday from four to six。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 16–20',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 16, type: 'mcq', prompt: 'What was kept from the original building?', options: ['The wooden floors', 'The furniture', 'The library shelves'], answer: 0, why: 'We kept the original wooden floors and most of the windows.' },
                { no: 17, type: 'mcq', prompt: 'Laptops borrowed from the library —', options: ['can be taken home', 'must stay in the building', 'cost a small fee'], answer: 1, why: 'can be used inside the building only。' },
                { no: 18, type: 'mcq', prompt: 'Who runs the homework club?', options: ['Paid librarians', 'Retired teachers and other volunteers', 'University students only'], answer: 1, why: 'staffed by volunteers, many of them retired teachers。' },
                { no: 19, type: 'mcq', prompt: 'The repair café takes place —', options: ['every Saturday', 'once a month', 'twice a year'], answer: 1, why: 'monthly ... on the first Saturday of the month。' },
                { no: 20, type: 'mcq', prompt: 'What is allowed in the reading areas?', options: ['Hot food', 'Drinks with lids', 'Loud conversation'], answer: 1, why: 'don\'t bring food into the reading areas — drinks with lids are fine。' },
              ],
            },
          ],
        },
        {
          part: 3,
          title: 'Part 3 · 讨论一份野外考察报告',
          intro: 'Two students, Maya and Leo, discuss their field trip report with their tutor.',
          script: [
            { s: 'Tutor', t: 'So, how did the report on the field trip come together?' },
            { s: 'Maya', t: 'It was harder than we expected. We collected a lot of data on the first day, but the weather changed on the second day, so some of our measurements were not comparable.' },
            { s: 'Leo', t: 'We decided to use only the first day\'s data for the analysis. It\'s not ideal, but at least the figures are consistent.' },
            { s: 'Tutor', t: 'That\'s a reasonable decision, as long as you explain it clearly in the method section. What did you find most difficult?' },
            { s: 'Maya', t: 'For me it was the statistics. We had never used that software before, and the tutorial only covered the basics. Leo spent a whole evening working out how to plot the results.' },
            { s: 'Leo', t: 'The graphs were the easy part, actually. What took the time was checking the data — we found two entries that had been recorded in the wrong column.' },
            { s: 'Tutor', t: 'Good catch. Did that change your conclusions?' },
            { s: 'Maya', t: 'Not the main one. The pattern was still clear. But it did make us less confident about the smaller differences between the sites.' },
            { s: 'Tutor', t: 'Fine. For the presentation, I\'d suggest focusing on one site rather than all three. You have twenty minutes, and that\'s not enough for a detailed comparison.' },
            { s: 'Leo', t: 'We were thinking of using the river site, because it had the most variation.' },
            { s: 'Tutor', t: 'Good choice. And leave time for questions — last year\'s group ran out of time and lost marks for that.' },
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 21–26',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 21, type: 'mcq', prompt: 'Why did the students use only the first day\'s data?', options: ['The second day\'s data was lost', 'The weather made the measurements inconsistent', 'The tutor asked them to'], answer: 1, why: 'the weather changed ... some of our measurements were not comparable。' },
                { no: 22, type: 'mcq', prompt: 'What does the tutor advise them to do?', options: ['Collect more data', 'Explain the decision in the method section', 'Remove the second day from the report'], answer: 1, why: 'as long as you explain it clearly in the method section。' },
                { no: 23, type: 'mcq', prompt: 'What did Maya find most difficult?', options: ['Writing the introduction', 'Using the statistics software', 'Working with Leo'], answer: 1, why: 'For me it was the statistics ... never used that software before。' },
                { no: 24, type: 'mcq', prompt: 'What took Leo the most time?', options: ['Drawing the graphs', 'Checking the data for errors', 'Reading the tutorial'], answer: 1, why: 'What took the time was checking the data。注意 graph 是 easy part。' },
                { no: 25, type: 'mcq', prompt: 'How did the errors affect their conclusions?', options: ['They changed the main conclusion', 'They made them less sure about small differences', 'They had no effect at all'], answer: 1, why: 'Not the main one ... less confident about the smaller differences。' },
                { no: 26, type: 'mcq', prompt: 'What does the tutor recommend for the presentation?', options: ['Compare all three sites', 'Focus on one site', 'Use more graphs'], answer: 1, why: 'focusing on one site rather than all three。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 27–30',
              instruction: 'Complete the sentences below. Write ONE WORD ONLY for each answer.',
              table: [
                ['The presentation will last for 27 ______ minutes.', ''],
                ['They will focus on the 28 ______ site.', ''],
                ['That site had the most 29 ______.', ''],
                ['They must leave time for 30 ______.', ''],
              ],
              questions: [
                { no: 27, type: 'blank', answer: '20', accept: ['twenty'], why: 'You have twenty minutes。' },
                { no: 28, type: 'blank', answer: 'river', why: 'using the river site。' },
                { no: 29, type: 'blank', answer: 'variation', why: 'because it had the most variation。' },
                { no: 30, type: 'blank', answer: 'questions', why: 'leave time for questions。' },
              ],
            },
          ],
        },
        {
          part: 4,
          title: 'Part 4 · 讲座：城市需要野一点',
          intro: 'A lecture on urban rewilding.',
          script: [
            { s: 'Speaker', t: 'Today I want to talk about a movement called urban rewilding. The idea is simple: instead of keeping every patch of city land tidy and controlled, we allow nature to take part of it back.' },
            { s: 'Speaker', t: 'The first thing to understand is that a city is not a desert. Even a small park can support a surprising number of species. In one study in Berlin, researchers found more than sixty kinds of bee in a single cemetery. The reason is that cemeteries are quiet, they are not sprayed with chemicals, and the grass is cut less often than in public parks.' },
            { s: 'Speaker', t: 'So what does rewilding actually look like? In practice it usually means three things: planting native species rather than exotic ones, cutting grass less frequently, and leaving some dead wood and fallen leaves in place. That last point is important. Many insects and fungi depend on dead wood, and fallen leaves provide shelter over winter.' },
            { s: 'Speaker', t: 'There are also benefits for people. Green spaces with more variety tend to be cooler in summer, because trees and long grass hold water and provide shade. They also absorb rainwater more effectively, which reduces the risk of flooding after heavy storms. And several studies suggest that spending time in less managed green spaces is associated with lower levels of stress.' },
            { s: 'Speaker', t: 'Of course, not everyone is happy. Some residents see long grass as untidy, and a few councils have been criticised for letting areas become overgrown. This is why communication matters. Where projects explain the reasons and mark the areas clearly, public support is usually much higher.' },
            { s: 'Speaker', t: 'The lesson, I think, is that rewilding is not about abandoning a place. It is about managing it differently, and accepting that a city can be both cared for and a little wild.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 31–34',
              instruction: 'Complete the notes below. Write NO MORE THAN TWO WORDS for each answer.',
              table: [
                ['In Berlin, 60+ kinds of bee found in one', '31 ______'],
                ['Rewilding: plant native species, cut grass less, leave', '32 ______ and fallen leaves'],
                ['More variety means cooler summer and less', '33 ______'],
                ['Main objection from residents: areas look', '34 ______'],
              ],
              questions: [
                { no: 31, type: 'blank', answer: 'cemetery', why: 'more than sixty kinds of bee in a single cemetery。' },
                { no: 32, type: 'blank', answer: 'dead wood', why: 'leaving some dead wood and fallen leaves in place。' },
                { no: 33, type: 'blank', answer: 'flooding', why: 'absorb rainwater more effectively, which reduces the risk of flooding。' },
                { no: 34, type: 'blank', answer: 'untidy', why: 'Some residents see long grass as untidy。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 35–40',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 35, type: 'mcq', prompt: 'What is urban rewilding mainly about?', options: ['Building more parks', 'Allowing nature to take part of the land back', 'Removing all grass'], answer: 1, why: 'allow nature to take part of it back。' },
                { no: 36, type: 'mcq', prompt: 'Why do cemeteries support so many bees?', options: ['They are sprayed regularly', 'They are quiet and less managed', 'They have many flowers planted'], answer: 1, why: 'quiet, not sprayed, grass cut less often。' },
                { no: 37, type: 'mcq', prompt: 'Why is dead wood important?', options: ['It looks natural', 'Insects and fungi depend on it', 'It stops grass growing'], answer: 1, why: 'Many insects and fungi depend on dead wood。' },
                { no: 38, type: 'mcq', prompt: 'Which benefit for people is mentioned?', options: ['Lower temperatures in summer', 'More space for cars', 'Cheaper housing'], answer: 0, why: 'Green spaces with more variety tend to be cooler in summer。' },
                { no: 39, type: 'mcq', prompt: 'Why do some residents object?', options: ['They fear animals', 'They think areas look untidy', 'They want more parking'], answer: 1, why: 'Some residents see long grass as untidy。' },
                { no: 40, type: 'mcq', prompt: 'What is the speaker\'s conclusion?', options: ['Cities should stop managing green spaces', 'Rewilding means managing land differently', 'Only rural areas can be wild'], answer: 1, why: 'It is about managing it differently。' },
              ],
            },
          ],
        },
      ],
    },

    reading: {
      title: 'Reading',
      minutes: 60,
      passages: [
        {
          no: 1,
          title: 'The Quiet Revolution of Remote Work',
          words: 320,
          text: [
            'For most of the twentieth century, the office was the natural home of professional work. Employees travelled to a building, sat at a desk, and were supervised in person. That model began to weaken in the 2010s, when faster internet and cheaper laptops made it possible to work from almost anywhere. Then, in 2020, the change became sudden rather than gradual. Within a few weeks, millions of people who had never worked from home were doing so full-time.',
            'The results were mixed, but not in the way many predicted. Early forecasts suggested that productivity would fall sharply. In fact, several large studies found that output stayed roughly the same, and in some tasks it improved. Workers saved time on commuting, and they reported fewer interruptions. However, the gains were uneven. Tasks that required concentration — writing, coding, analysis — often went better at home. Tasks that depended on quick exchanges with colleagues sometimes became slower.',
            'There was also a cost that was harder to measure. New employees, in particular, struggled. Learning how an organisation works depends heavily on overhearing conversations and copying the behaviour of experienced colleagues. A person who joins a company remotely may understand the formal rules but miss the unwritten ones. Several firms reported that their new staff took longer to become fully effective.',
            'The compromise that has emerged is hybrid work: some days in the office, some at home. Yet the details matter more than the label. A team that meets on the same two days each week behaves very differently from one where everyone chooses independently. The former keeps the social contact that supports learning; the latter gives individuals more control but can leave offices half-empty and teams fragmented.',
            'What seems clear is that the office will not disappear, but it will no longer be the default. The most successful organisations appear to be those that treat location as a design question rather than a rule: deciding, task by task, where the work is done best.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 1–7',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 1, type: 'mcq', prompt: 'What does the writer say about the change to remote work in 2020?', options: ['It had been planned for years', 'It happened very quickly', 'It affected only small companies', 'It was caused by new laws'], answer: 1, why: 'the change became sudden rather than gradual ... within a few weeks。' },
                { no: 2, type: 'mcq', prompt: 'Early forecasts about productivity were —', options: ['accurate', 'too optimistic', 'too pessimistic', 'never tested'], answer: 2, why: '预测会大幅下降，实际基本持平甚至提高 → 过于悲观。' },
                { no: 3, type: 'mcq', prompt: 'Which tasks tended to improve at home?', options: ['Tasks needing concentration', 'Tasks needing quick exchange', 'Tasks involving new staff', 'Tasks requiring supervision'], answer: 0, why: 'Tasks that required concentration often went better at home。' },
                { no: 4, type: 'mcq', prompt: 'Why did new employees struggle?', options: ['They lacked equipment', 'They missed informal learning', 'They were paid less', 'They had longer commutes'], answer: 1, why: 'depends heavily on overhearing conversations and copying behaviour。' },
                { no: 5, type: 'mcq', prompt: 'What problem does the writer identify with independent hybrid choices?', options: ['Higher costs', 'Offices half-empty and teams fragmented', 'Slower internet', 'More meetings'], answer: 1, why: 'can leave offices half-empty and teams fragmented。' },
                { no: 6, type: 'mcq', prompt: 'The phrase "the unwritten ones" refers to —', options: ['formal rules', 'informal ways of working', 'contracts', 'emails'], answer: 1, why: '对应前句 the formal rules 之外的「不成文规矩」。' },
                { no: 7, type: 'mcq', prompt: 'What is the writer\'s overall view?', options: ['Offices should be abolished', 'Everyone should work from home', 'Location should be decided task by task', 'Hybrid work has failed'], answer: 2, why: 'treat location as a design question rather than a rule。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 8–10',
              instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.',
              table: [
                ['In 2020 remote work changed suddenly rather than', '8 ______'],
                ['Tasks that needed quick exchanges with colleagues became', '9 ______'],
                ['Hybrid teams that meet on fixed days keep the social contact that supports', '10 ______'],
              ],
              questions: [
                { no: 8, type: 'blank', answer: 'gradually', why: 'the change became sudden rather than gradual（题干用原形 gradually）。' },
                { no: 9, type: 'blank', answer: 'slower', why: 'Tasks that depended on quick exchanges ... sometimes became slower。' },
                { no: 10, type: 'blank', answer: 'learning', why: 'keeps the social contact that supports learning。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 11–13',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 11, type: 'tfng', prompt: 'All employees became more productive when they worked from home.', answer: 'FALSE', why: '原文说 gains were uneven，部分任务变慢，并非所有人都提高。' },
                { no: 12, type: 'tfng', prompt: 'Some firms found that new staff took longer to become fully effective.', answer: 'TRUE', why: 'Several firms reported that their new staff took longer to become fully effective。' },
                { no: 13, type: 'tfng', prompt: 'Most companies have now closed their offices completely.', answer: 'NOT GIVEN', why: '原文只说 office will not disappear，没有提「大多数公司关闭办公室」。' },
              ],
            },
          ],
        },
        {
          no: 2,
          title: 'Rewilding the City',
          words: 330,
          text: [
            'A few years ago, the council of a mid-sized European city made an unexpected decision. Instead of mowing a large riverside park every two weeks, it would cut the grass only twice a year. The change cost almost nothing and saved money on fuel. Within three years, the number of insect species in the park had risen by nearly a third, and the park had become one of the most visited places in the city.',
            'This is one small example of what has come to be called urban rewilding. The term is deliberately loose. It can mean planting wildflower meadows on roundabouts, allowing a corner of a park to grow into scrub, or simply leaving fallen leaves where they land. What these projects share is a willingness to give up a little control.',
            'The ecological argument is straightforward. Cities cover only a small fraction of the Earth\'s surface, but they expand into land that was once habitat. A garden, a railway embankment or a cemetery can act as a stepping stone, allowing species to move between larger areas. Connectivity matters as much as the size of any single site.',
            'There are economic arguments too. Long grass and trees cool the air, reducing the need for air conditioning in nearby buildings. They also hold rainwater, which lowers the risk of flooding during heavy storms — a problem that is becoming more expensive as the climate changes. Some cities have calculated that the savings from avoided flood damage are many times the cost of the rewilding itself.',
            'Yet the idea has opponents. Some residents associate long grass with neglect, and councils have been accused of using rewilding as an excuse to cut maintenance budgets. The objection is not unreasonable: a badly managed site can look abandoned and can attract litter. Successful projects tend to share certain features. They explain what is happening, using signs and public meetings. They mow a clear path through the long grass so that the area still feels cared for. And they are honest about the trade-offs.',
            'Perhaps the most important lesson is about patience. A meadow takes several years to establish, and the first summer may look worse than the mown lawn it replaced. Cities that have succeeded are those that were willing to wait, and to explain the wait to the people who live there.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 14–20',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 14, type: 'mcq', prompt: 'What was the result of mowing the park less often?', options: ['Fewer visitors', 'More insect species and more visitors', 'Higher costs', 'A new car park'], answer: 1, why: 'insect species risen by nearly a third；park 成为最受欢迎的地方之一。' },
                { no: 15, type: 'mcq', prompt: 'The term "urban rewilding" is described as —', options: ['precisely defined', 'deliberately loose', 'outdated', 'controversial in science'], answer: 1, why: 'The term is deliberately loose。' },
                { no: 16, type: 'mcq', prompt: 'Why are small sites important?', options: ['They are cheaper to manage', 'They act as stepping stones between habitats', 'They attract tourists', 'They produce food'], answer: 1, why: 'can act as a stepping stone ... Connectivity matters。' },
                { no: 17, type: 'mcq', prompt: 'One economic benefit mentioned is —', options: ['higher property prices', 'reduced flood risk', 'more parking spaces', 'cheaper food'], answer: 1, why: 'hold rainwater, which lowers the risk of flooding。' },
                { no: 18, type: 'mcq', prompt: 'Why do some residents object?', options: ['They dislike insects', 'They think the areas look neglected', 'They want more houses', 'They are worried about safety'], answer: 1, why: 'associate long grass with neglect。' },
                { no: 19, type: 'mcq', prompt: 'Which feature do successful projects share?', options: ['They hide the changes', 'They mow clear paths and explain', 'They remove all signs', 'They close the area to the public'], answer: 1, why: 'explain what is happening ... mow a clear path。' },
                { no: 20, type: 'mcq', prompt: 'What does the writer say about patience?', options: ['Results appear immediately', 'The first summer may look worse', 'It is not necessary', 'Only scientists need it'], answer: 1, why: 'the first summer may look worse than the mown lawn。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 21–23',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 21, type: 'tfng', prompt: 'Cutting grass less often saved the council money.', answer: 'TRUE', why: 'The change cost almost nothing and saved money on fuel。' },
                { no: 22, type: 'tfng', prompt: 'Rewilding projects always cost more than traditional maintenance.', answer: 'FALSE', why: '原文强调「省钱」与「避免洪水损失的收益是成本的很多倍」，与陈述相反。' },
                { no: 23, type: 'tfng', prompt: 'Most residents in the city supported the project immediately.', answer: 'NOT GIVEN', why: '只说了有反对者，没有给出支持比例。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 24–27',
              instruction: 'Complete the sentences below. Write ONE WORD ONLY for each answer.',
              table: [
                ['The city cut the grass only', '24 ______ a year.'],
                ['Small sites allow species to move between larger areas, so connectivity matters as much as', '25 ______.'],
                ['Long grass and trees hold rainwater and lower the risk of', '26 ______.'],
                ['A badly managed site can look abandoned and attract', '27 ______.'],
              ],
              questions: [
                { no: 24, type: 'blank', answer: 'twice', why: 'cut the grass only twice a year。' },
                { no: 25, type: 'blank', answer: 'size', why: 'Connectivity matters as much as the size of any single site。' },
                { no: 26, type: 'blank', answer: 'flooding', why: 'lowers the risk of flooding。' },
                { no: 27, type: 'blank', answer: 'litter', why: 'can look abandoned and can attract litter。' },
              ],
            },
          ],
        },
        {
          no: 3,
          title: 'Why We Forget',
          words: 340,
          text: [
            'Memory is often compared to a cupboard or a hard drive, a place where information is stored until it is needed. This metaphor is convenient, but it is wrong in an important way. Forgetting is not usually a failure of storage. More often, it is a failure of retrieval, or a sign that the information was never encoded in a form the brain could use later.',
            'Consider what happens when you meet someone at a party. You hear their name, repeat it once, and continue the conversation. A minute later the name is gone. This is not because your brain is full. It is because the name was processed shallowly: you heard the sound but did not connect it to anything you already knew. Information that is linked to existing knowledge is far more likely to survive.',
            'This finding has a practical consequence. Rereading a textbook feels productive because the material becomes familiar. But familiarity is not the same as memory. In experiments, students who reread a passage several times often perform worse than students who read it once and then try to recall it. The effort of recall, even when it fails, strengthens the memory more than passive exposure does.',
            'The timing of review matters as well. Memory weakens quickly at first and then more slowly. Reviewing soon after learning, and again after a longer gap, produces better long-term retention than the same amount of study concentrated in one session. This is the principle behind spaced repetition, which is now used in language learning apps and medical training.',
            'There is also a social dimension. People remember information better when they expect to teach it to someone else, or when they discuss it with others. Explaining an idea forces you to notice the gaps in your understanding, and those gaps are exactly what you need to work on.',
            'None of this makes memory effortless. It does, however, suggest that the strategies we usually rely on — highlighting, rereading, copying notes — are among the least effective. What works is harder: retrieving, spacing, and explaining.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 28–34',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 28, type: 'mcq', prompt: 'The writer says the cupboard metaphor is wrong because —', options: ['memory has no limit', 'forgetting is often a retrieval problem', 'the brain stores too much', 'memory is not physical'], answer: 1, why: 'Forgetting is not usually a failure of storage ... failure of retrieval。' },
                { no: 29, type: 'mcq', prompt: 'Why do we forget a name heard at a party?', options: ['The brain is full', 'The name was processed shallowly', 'Names are harder than faces', 'We did not like the person'], answer: 1, why: 'the name was processed shallowly。' },
                { no: 30, type: 'mcq', prompt: 'What do experiments show about rereading?', options: ['It is the best method', 'It feels productive but is less effective than recall', 'It should be done three times', 'It prevents forgetting completely'], answer: 1, why: 'familiarity is not the same as memory ... perform worse than students who ... try to recall。' },
                { no: 31, type: 'mcq', prompt: 'What is the principle behind spaced repetition?', options: ['Study everything the night before', 'Review soon, then again after longer gaps', 'Never review', 'Study only when motivated'], answer: 1, why: 'Reviewing soon after learning, and again after a longer gap。' },
                { no: 32, type: 'mcq', prompt: 'Why does explaining help memory?', options: ['It makes learning faster', 'It reveals gaps in understanding', 'It replaces revision', 'It reduces stress'], answer: 1, why: 'forces you to notice the gaps in your understanding。' },
                { no: 33, type: 'mcq', prompt: 'Which strategies does the writer call least effective?', options: ['Retrieval and spacing', 'Highlighting and rereading', 'Explaining to others', 'Testing yourself'], answer: 1, why: 'highlighting, rereading, copying notes — among the least effective。' },
                { no: 34, type: 'mcq', prompt: 'The overall tone of the passage is —', options: ['discouraging', 'informative and practical', 'humorous', 'uncertain'], answer: 1, why: '给出研究发现与可操作建议，语气是「说明 + 实用」。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 35–37',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 35, type: 'tfng', prompt: 'The effort of trying to recall something can strengthen memory even when the attempt fails.', answer: 'TRUE', why: 'The effort of recall, even when it fails, strengthens the memory。' },
                { no: 36, type: 'tfng', prompt: 'Spaced repetition is only used in language learning.', answer: 'FALSE', why: '原文说 language learning apps and medical training。' },
                { no: 37, type: 'tfng', prompt: 'The writer believes that memory can be made effortless.', answer: 'FALSE', why: 'None of this makes memory effortless。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 38–40',
              instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.',
              table: [
                ['A name is forgotten because it was processed', '38 ______'],
                ['Information linked to existing knowledge is more likely to', '39 ______'],
                ['Effective strategies include retrieving, spacing and', '40 ______'],
              ],
              questions: [
                { no: 38, type: 'blank', answer: 'shallowly', why: 'the name was processed shallowly。' },
                { no: 39, type: 'blank', answer: 'survive', why: 'far more likely to survive。' },
                { no: 40, type: 'blank', answer: 'explaining', why: 'What works is harder: retrieving, spacing, and explaining。' },
              ],
            },
          ],
        },
      ],
    },
};

import { READING_B } from './exams-b.js';

/** 套题 B：目前只有阅读（40 题），听力部分留空但不影响模考 */
const SET_B = {
  id: 'setB',
  name: '模考 B · 阅读专练',
  subtitle: '3 篇文章 · 40 题 · 只测阅读',
  level: '5.5 – 6.5',
  listening: null,
  reading: {
    title: 'Reading',
    minutes: 60,
    passages: READING_B.passages,
  },
};

export const EXAM_SETS = [SET_A, SET_B];
