/* =========================================================
   listening.js · 听力材料
   音频由浏览器语音合成（Web Speech API）朗读脚本，不依赖外部音频文件。
   每课含 4 道单选 / 填空 + 2 句听写。
   ========================================================= */

export const LISTENING = {
  l1: {
    title: 'At the Library',
    cn: '图书馆导览',
    topic: '校园',
    style: 'dialogue',
    accent: 'GB',
    script: [
      { s: 'Woman', t: 'Good morning. Is this the main library?' },
      { s: 'Man', t: 'That\'s right. It\'s the biggest one on campus, and it\'s open from eight in the morning until ten at night, Monday to Friday.' },
      { s: 'Woman', t: 'And at the weekend?' },
      { s: 'Man', t: 'On Saturdays we open at nine and close at six. We\'re closed on Sundays during the summer.' },
      { s: 'Woman', t: 'OK. How many books can I borrow?' },
      { s: 'Man', t: 'Undergraduates can take out up to eight books at a time, for three weeks. If you need longer, you can renew them online twice.' },
      { s: 'Woman', t: 'That\'s useful. Is there somewhere quiet to study?' },
      { s: 'Man', t: 'The second floor is the quiet zone. The third floor has group rooms, but you need to book those at least a day in advance. And the café on the ground floor stays open until eight.' },
      { s: 'Woman', t: 'Great. One more thing — do you run any classes for new students?' },
      { s: 'Man', t: 'Yes, every Wednesday afternoon at two. It\'s a short session on finding sources and referencing. You can sign up at the front desk.' },
    ],
    questions: [
      { q: 'When is the library closed?', opts: ['Saturday afternoon', 'Sunday in summer', 'Wednesday morning', 'Friday evening'], a: 1, why: '男声说 We\'re closed on Sundays during the summer.' },
      { q: 'How long can undergraduates keep a book?', opts: ['One week', 'Two weeks', 'Three weeks', 'Four weeks'], a: 2, why: 'three weeks，并且可以线上续借两次。' },
      { q: 'Where should students go for a quiet place to study?', opts: ['The ground floor', 'The second floor', 'The third floor', 'The café'], a: 1, why: 'The second floor is the quiet zone.' },
      { q: 'What must students do to use a group room?', opts: ['Pay a small fee', 'Book it a day before', 'Ask a librarian each time', 'Arrive before nine'], a: 1, why: 'you need to book those at least a day in advance.' },
    ],
    dictation: [
      { text: 'Undergraduates can take out up to eight books at a time.', zh: '本科生一次最多可以借八本书。' },
      { text: 'The second floor is the quiet zone.', zh: '二楼是安静区。' },
    ],
  },

  l2: {
    title: 'Choosing a Sports Club',
    cn: '选一个运动社团',
    topic: '校园',
    style: 'dialogue',
    accent: 'GB',
    script: [
      { s: 'Man', t: 'Hi, I\'m thinking of joining a sports club this term. What do you have?' },
      { s: 'Woman', t: 'Well, the most popular one is football. We train on Tuesdays and Thursdays, from six to seven thirty in the evening.' },
      { s: 'Man', t: 'I\'m not very good at football, to be honest. Anything else?' },
      { s: 'Woman', t: 'There\'s badminton. It\'s much more relaxed, and you don\'t need any experience. We meet on Wednesday afternoons in the main hall. It costs twenty pounds a term, which covers the court and the shuttles.' },
      { s: 'Man', t: 'That sounds better. Do I need my own racket?' },
      { s: 'Woman', t: 'We have a few you can borrow, but most people buy their own after a couple of weeks. The sports shop near the station gives students a ten per cent discount.' },
      { s: 'Man', t: 'Good to know. And is there a swimming club?' },
      { s: 'Woman', t: 'Yes, but the pool is being repaired until the end of next month, so swimming won\'t start until November.' },
      { s: 'Man', t: 'OK. I\'ll come along on Wednesday and see how it goes.' },
      { s: 'Woman', t: 'Perfect. Just bring comfortable clothes and a bottle of water. And arrive ten minutes early so we can register you.' },
    ],
    questions: [
      { q: 'When does the football club train?', opts: ['Monday and Friday mornings', 'Tuesday and Thursday evenings', 'Wednesday afternoons', 'Saturday mornings'], a: 1, why: 'Tuesdays and Thursdays, from six to seven thirty in the evening.' },
      { q: 'Why does the man prefer badminton?', opts: ['It is cheaper than football', 'It is more relaxed and needs no experience', 'It takes place outdoors', 'His friend plays it'], a: 1, why: 'badminton is much more relaxed and needs no experience.' },
      { q: 'What does the twenty pounds cover?', opts: ['A racket and shoes', 'The court and shuttles', 'Coaching lessons', 'Club membership for a year'], a: 1, why: 'covers the court and the shuttles（场地和羽毛球）。' },
      { q: 'Why can\'t the man join swimming now?', opts: ['The club is full', 'The pool is being repaired', 'There is no coach', 'It is too expensive'], a: 1, why: 'the pool is being repaired until the end of next month.' },
    ],
    dictation: [
      { text: 'It is much more relaxed and you do not need any experience.', zh: '它轻松得多，而且不需要任何经验。' },
      { text: 'The sports shop gives students a ten per cent discount.', zh: '那家体育用品店给学生打九折。' },
    ],
  },

  l3: {
    title: 'Weekend Weather Report',
    cn: '周末天气播报',
    topic: '天气',
    style: 'monologue',
    accent: 'AU',
    script: [
      { s: 'Speaker', t: 'And now the weekend weather. After a wet and windy Friday, conditions will improve steadily over the next two days.' },
      { s: 'Speaker', t: 'Saturday morning will start cloudy, with a few showers in the north, but these will clear by lunchtime. Temperatures will reach around eighteen degrees in the afternoon, which is normal for this time of year. If you\'re planning to be outside, the best time is between two and five, when the sun is most likely to appear.' },
      { s: 'Speaker', t: 'Sunday will be the warmer of the two days, with temperatures climbing to twenty-two degrees. However, strong winds are expected along the coast, so sailors and cyclists should take care. There is also a chance of thunderstorms in the late afternoon.' },
      { s: 'Speaker', t: 'Looking ahead to next week, a cold front will arrive on Tuesday, bringing rain and much lower temperatures. So enjoy the weekend, but keep a jacket ready.' },
    ],
    questions: [
      { q: 'What was Friday like?', opts: ['Sunny and warm', 'Wet and windy', 'Cold and snowy', 'Cloudy but dry'], a: 1, why: '开头说 After a wet and windy Friday。' },
      { q: 'When is the best time to be outside on Saturday?', opts: ['Early morning', 'Around lunchtime', 'Between two and five', 'After seven'], a: 2, why: 'the best time is between two and five.' },
      { q: 'What is the highest temperature expected on Sunday?', opts: ['18 degrees', '20 degrees', '22 degrees', '25 degrees'], a: 2, why: 'Sunday 升温到 22 度，是两天里更暖的一天。' },
      { q: 'What change is expected next week?', opts: ['A heat wave', 'A cold front with rain', 'Strong sunshine', 'Snow in the north'], a: 1, why: 'a cold front will arrive on Tuesday, bringing rain and much lower temperatures.' },
    ],
    dictation: [
      { text: 'Temperatures will reach around eighteen degrees in the afternoon.', zh: '下午气温将达到 18 度左右。' },
      { text: 'Strong winds are expected along the coast.', zh: '沿海地区预计会有强风。' },
    ],
  },

  l4: {
    title: 'The Campus Garden',
    cn: '校园菜园',
    topic: '环境',
    style: 'interview',
    accent: 'GB',
    script: [
      { s: 'Interviewer', t: 'Dr Patel, you started the campus garden three years ago. Why did you begin?' },
      { s: 'Dr Patel', t: 'We wanted students to see where food actually comes from. Many of them had never grown anything before. We started with just six small beds behind the science building, and now we have more than forty.' },
      { s: 'Interviewer', t: 'Who does the work?' },
      { s: 'Dr Patel', t: 'It\'s completely run by volunteers — students, staff, and a few people from the local community. We meet every Saturday morning. Nobody is paid, but everyone takes home vegetables, and we run free workshops once a month.' },
      { s: 'Interviewer', t: 'Has it changed anything on campus?' },
      { s: 'Dr Patel', t: 'Definitely. The café now uses some of our vegetables, which cuts its food miles. More importantly, students who work in the garden say they feel less stressed. One study of our volunteers found that their sleep improved within six weeks.' },
      { s: 'Interviewer', t: 'What are your plans?' },
      { s: 'Dr Patel', t: 'We\'re building a small greenhouse so we can grow food through the winter. We also want to start a seed library, where people can borrow seeds and return them at the end of the season.' },
    ],
    questions: [
      { q: 'How many garden beds are there now?', opts: ['Six', 'Fourteen', 'Forty', 'Over forty'], a: 3, why: 'now we have more than forty。注意 six 是「开始时」。' },
      { q: 'How is the garden run?', opts: ['By paid staff', 'By volunteers', 'By a local company', 'By the science department'], a: 1, why: 'It\'s completely run by volunteers.' },
      { q: 'What benefit do student volunteers report?', opts: ['Better grades', 'More money', 'Less stress and better sleep', 'Free meals every day'], a: 2, why: 'feel less stressed，睡眠在六周内改善。' },
      { q: 'What are they planning to build?', opts: ['A new café', 'A greenhouse', 'A car park', 'A larger science building'], a: 1, why: 'We\'re building a small greenhouse.' },
    ],
    dictation: [
      { text: 'The garden is completely run by volunteers.', zh: '这个菜园完全由志愿者管理。' },
      { text: 'They want to start a seed library.', zh: '他们想开办一个种子图书馆。' },
    ],
  },

  l5: {
    title: 'Changes to the Morning Train',
    cn: '早班列车调整',
    topic: '交通',
    style: 'monologue',
    accent: 'GB',
    script: [
      { s: 'Speaker', t: 'Good morning, passengers. This is an announcement about services to the city centre. The seven forty train to Central Station will not run today because of engineering work between the airport and the city.' },
      { s: 'Speaker', t: 'Passengers travelling to the city should take the seven fifty-five service to Riverside, which will stop at all stations. From Riverside, a replacement bus will take you to Central Station. The bus journey takes about twenty minutes and is included in your ticket.' },
      { s: 'Speaker', t: 'We expect the seven fifty-five train to be busy, so please allow extra time to board. Passengers with a seat reservation for the seven forty will be able to use it on the later train.' },
      { s: 'Speaker', t: 'We would like to apologise for the inconvenience. Normal service is expected to return tomorrow morning. If you decide not to travel, you can get a full refund at the ticket office until six this evening.' },
    ],
    questions: [
      { q: 'Why is the 7:40 train cancelled?', opts: ['Bad weather', 'A lack of drivers', 'Engineering work', 'A passenger emergency'], a: 2, why: 'because of engineering work between the airport and the city.' },
      { q: 'How will passengers reach Central Station?', opts: ['By taxi', 'By replacement bus from Riverside', 'By a later direct train', 'On foot from the airport'], a: 1, why: '先坐 7:55 到 Riverside，再换替代巴士到 Central Station。' },
      { q: 'What should passengers with a seat reservation do?', opts: ['Cancel their ticket', 'Use it on the later train', 'Wait for tomorrow', 'Pay again'], a: 1, why: 'will be able to use it on the later train.' },
      { q: 'Until when can passengers get a refund?', opts: ['12 noon', '3 p.m.', '6 p.m.', 'Tomorrow morning'], a: 2, why: 'a full refund at the ticket office until six this evening.' },
    ],
    dictation: [
      { text: 'The bus journey takes about twenty minutes.', zh: '巴士车程大约二十分钟。' },
      { text: 'Normal service is expected to return tomorrow morning.', zh: '预计明天早上恢复正常服务。' },
    ],
  },

  l6: {
    title: 'A Voice Message About a Course',
    cn: '关于一门课程的语音留言',
    topic: '学习',
    style: 'monologue',
    accent: 'US',
    script: [
      { s: 'Speaker', t: 'Hi Maria, it\'s Tom. I\'m calling about the evening course we talked about. I went to the information session last night, and I think you\'d really like it.' },
      { s: 'Speaker', t: 'It\'s a twelve-week course on public speaking, on Tuesday evenings from seven to nine. The first half of each class is practice, and the second half is feedback. The teacher used to work for a radio station, so she\'s very good at helping people sound natural.' },
      { s: 'Speaker', t: 'The full price is two hundred and forty pounds, but there\'s a discount for students, so it would be one hundred and eighty for you. You do need to register before Friday, though, because there are only twenty places.' },
      { s: 'Speaker', t: 'Oh, and one thing — they ask everyone to give a short talk in the final week. It\'s not examined; it\'s just for practice. Let me know if you want to go together. Call me back when you get this.' },
    ],
    questions: [
      { q: 'How long is the course?', opts: ['Six weeks', 'Ten weeks', 'Twelve weeks', 'Twenty weeks'], a: 2, why: 'It\'s a twelve-week course.' },
      { q: 'What does the teacher do in the first half of each class?', opts: ['Give a lecture', 'Let students practise', 'Mark homework', 'Play recordings'], a: 1, why: 'The first half of each class is practice, the second half is feedback.' },
      { q: 'How much will Maria pay?', opts: ['£180', '£200', '£240', '£260'], a: 0, why: '学生折扣后 one hundred and eighty pounds。' },
      { q: 'Why should Maria register before Friday?', opts: ['The price will rise', 'The course starts then', 'There are only twenty places', 'The teacher is leaving'], a: 2, why: 'there are only twenty places.' },
    ],
    dictation: [
      { text: 'The first half of each class is practice.', zh: '每节课的前半段是练习。' },
      { text: 'There are only twenty places on the course.', zh: '这门课只有二十个名额。' },
    ],
  },

  l7: {
    title: 'A Talk on Recycling',
    cn: '关于回收的讲座',
    topic: '环境',
    style: 'monologue',
    accent: 'GB',
    script: [
      { s: 'Speaker', t: 'Thank you for inviting me. I want to talk about something that sounds simple: recycling. Most of us put bottles and paper in the right bin and feel that we have done our part. But the reality is more complicated.' },
      { s: 'Speaker', t: 'First, not everything we put in the recycling bin is actually recycled. In this country, about a quarter of what arrives at recycling centres cannot be processed. Often it is food waste left in containers, or materials that look recyclable but are not.' },
      { s: 'Speaker', t: 'Second, recycling is the last step, not the first. The order should be: reduce, reuse, then recycle. A cotton bag that is used a hundred times is better than a hundred plastic bags, but only if you actually use it. The most effective action for most families is simply to buy less.' },
      { s: 'Speaker', t: 'Finally, I want to mention repair. Many products are designed to be thrown away, but a growing number of local groups now help people fix appliances, clothes and bicycles. Last year, our repair café kept about two tonnes of goods out of landfill. That is small, but it shows what is possible.' },
    ],
    questions: [
      { q: 'What does the speaker say about the recycling bin?', opts: ['Everything in it is recycled', 'About a quarter of it cannot be processed', 'It is only for paper', 'It is checked by the government'], a: 1, why: 'about a quarter of what arrives at recycling centres cannot be processed.' },
      { q: 'What is the correct order of actions?', opts: ['Recycle, reuse, reduce', 'Reuse, recycle, reduce', 'Reduce, reuse, recycle', 'Recycle, reduce, reuse'], a: 2, why: 'The order should be: reduce, reuse, then recycle.' },
      { q: 'Which action does the speaker call most effective?', opts: ['Buying a cotton bag', 'Buying less', 'Recycling more often', 'Using paper bags'], a: 1, why: 'The most effective action for most families is simply to buy less.' },
      { q: 'What does the repair café do?', opts: ['Sells second-hand goods', 'Helps people fix things', 'Collects food waste', 'Runs recycling centres'], a: 1, why: 'help people fix appliances, clothes and bicycles.' },
    ],
    dictation: [
      { text: 'Recycling is the last step, not the first.', zh: '回收是最后一步，而不是第一步。' },
      { text: 'The most effective action is simply to buy less.', zh: '最有效的行动就是少买一点。' },
    ],
  },

  l8: {
    title: 'A Doctor on Screen Time',
    cn: '医生谈屏幕时间',
    topic: '健康',
    style: 'interview',
    accent: 'US',
    script: [
      { s: 'Interviewer', t: 'Dr Lee, parents are often told to limit their children\'s screen time. Is that the right advice?' },
      { s: 'Dr Lee', t: 'It depends on what the screens are used for, and on the child\'s age. For very young children, under two, we still recommend almost no screen time. For older children, the question is less about minutes and more about what they are doing and who they are with.' },
      { s: 'Interviewer', t: 'So some screen time can be good?' },
      { s: 'Dr Lee', t: 'Yes. A video call with grandparents, a documentary, or a coding game can be valuable. The problems appear when screens replace other things: sleep, physical activity, and face-to-face conversation. If a child is staying up late to play games, that is a much bigger concern than the number of hours.' },
      { s: 'Interviewer', t: 'What should parents do?' },
      { s: 'Dr Lee', t: 'Keep screens out of the bedroom, agree on clear rules before rather than during an argument, and watch something together when you can. Children learn from what adults do, not only from what they say.' },
    ],
    questions: [
      { q: 'What does Dr Lee say about children under two?', opts: ['They need two hours of screens', 'They should have almost no screen time', 'They learn well from videos', 'They should watch with parents'], a: 1, why: 'under two, we still recommend almost no screen time.' },
      { q: 'According to Dr Lee, the main question is —', opts: ['How many minutes children use screens', 'What children do and who they are with', 'Which device they use', 'Where the screen is made'], a: 1, why: 'the question is less about minutes and more about what they are doing and who they are with.' },
      { q: 'Which is the biggest concern?', opts: ['Watching a documentary', 'A video call with grandparents', 'Staying up late to play games', 'Using a coding game'], a: 2, why: '最担心的是屏幕挤占睡眠、运动和面对面交流。' },
      { q: 'Which advice is NOT mentioned?', opts: ['Keep screens out of the bedroom', 'Agree on rules in advance', 'Watch something together', 'Set a daily time limit of one hour'], a: 3, why: '医生强调重点不在「固定分钟数」，没提一小时上限。' },
    ],
    dictation: [
      { text: 'Keep screens out of the bedroom.', zh: '不要把屏幕带进卧室。' },
      { text: 'Children learn from what adults do.', zh: '孩子是从大人的行为中学习的。' },
    ],
  },
};
