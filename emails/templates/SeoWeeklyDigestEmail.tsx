import React from 'react';
import { Body, Container, Head, Html, Section, Text } from '@react-email/components';

interface ISeoWeeklyDigestSection {
  title: string;
  rows: string[];
}

interface ISeoWeeklyDigestEmailProps {
  appName?: string;
  day: string;
  sections: ISeoWeeklyDigestSection[];
}

export function SeoWeeklyDigestEmail({
  appName = 'MyImageUpscaler',
  day,
  sections,
}: ISeoWeeklyDigestEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ margin: '0 auto', maxWidth: '560px', padding: '32px 20px' }}>
          <Section>
            <Text style={{ fontSize: '24px', fontWeight: 700 }}>{appName} weekly SEO digest</Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>Day: {day}</Text>
            {sections
              .filter(section => section.rows.length > 0)
              .map(section => (
                <Section key={section.title}>
                  <Text style={{ fontSize: '18px', fontWeight: 700 }}>{section.title}</Text>
                  {section.rows.map((row, index) => (
                    <Text key={index} style={{ fontSize: '16px', lineHeight: '24px' }}>
                      {row}
                    </Text>
                  ))}
                </Section>
              ))}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
